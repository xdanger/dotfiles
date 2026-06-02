#!/usr/bin/python3
"""ai-agent power-monitor — cheap periodic collector.

Runs as a root LaunchDaemon every few minutes. Takes one short powermetrics
sample, distills it to compact NDJSON, and appends to the day's raw log.
Designed to be near-zero cost: one short sample, stdlib only, no network.

IMPORTANT: a root LaunchDaemon's HOME is /var/root, so the data directory is
NEVER inferred from ~ — it is passed in via --data-dir (install.sh bakes the
real user path into the plist). Files we create are chowned back to whoever
owns the data dir, so the user-context analyzer can read/rotate them freely.

Python 3.9, standard library only (this is the system /usr/bin/python3).
"""
import argparse
import datetime as dt
import glob
import gzip
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import time

POWERMETRICS = "/usr/bin/powermetrics"
TOP_N = 30           # how many processes (by energy impact) to record per tick
SAMPLE_MS = 1500     # powermetrics sample window
GZIP_AFTER_DAYS = 14
DELETE_AFTER_DAYS = 60


def run_powermetrics():
    cmd = [
        POWERMETRICS, "--format", "plist", "-n", "1", "-i", str(SAMPLE_MS),
        "--samplers", "cpu_power,gpu_power,tasks", "--show-process-energy",
    ]
    if os.geteuid() != 0:
        # allow manual testing as a user that has the ai-agent NOPASSWD grant
        cmd = ["/usr/bin/sudo", "-n"] + cmd
    out = subprocess.run(cmd, capture_output=True, timeout=30).stdout
    # powermetrics may emit a leading non-plist line on some builds; trim to <?xml
    i = out.find(b"<?xml")
    if i > 0:
        out = out[i:]
    return plistlib.loads(out)


def read_power_source():
    """Cheap AC-vs-battery + charge read. Laptop, so this varies; analysis
    cares whether a burst happened on battery. Failsafe: (None, None)."""
    try:
        out = subprocess.run(
            ["/usr/bin/pmset", "-g", "batt"], capture_output=True, timeout=5
        ).stdout.decode("utf-8", "replace")
    except Exception:
        return None, None
    src = "ac" if "AC Power" in out else ("battery" if "Battery Power" in out else None)
    pct = None
    m = re.search(r"(\d+)%", out)
    if m:
        pct = int(m.group(1))
    return src, pct


def build_records(d, now):
    proc = d.get("processor", {}) or {}
    gpu = d.get("gpu", {}) or {}
    try:
        load1, load5, load15 = os.getloadavg()
    except OSError:
        load1 = load5 = load15 = None

    pwr, batt_pct = read_power_source()

    sys_rec = {
        "t": now, "type": "sys",
        "pwr": pwr, "batt_pct": batt_pct,
        "cpu_mw": proc.get("cpu_power"),
        "gpu_mw": proc.get("gpu_power"),
        "ane_mw": proc.get("ane_power"),
        "combined_mw": proc.get("combined_power"),
        "gpu_mhz": round(gpu["freq_hz"] / 1e6, 1) if gpu.get("freq_hz") else None,
        "gpu_busy_pct": round((1.0 - gpu["idle_ratio"]) * 100, 1) if gpu.get("idle_ratio") is not None else None,
        "load1": load1, "load5": load5, "load15": load15,
        "ncpu": os.cpu_count(),
        "osver": d.get("kern_osversion"),
    }

    tasks = d.get("tasks") or []
    tasks = [t for t in tasks if t.get("energy_impact") is not None]
    tasks.sort(key=lambda t: t.get("energy_impact", 0), reverse=True)
    recs = []
    for t in tasks[:TOP_N]:
        recs.append({
            "t": now, "type": "energy",
            "pid": t.get("pid"),
            "name": t.get("name"),
            "eimpact": round(t.get("energy_impact", 0), 2),
            "cpu_ms_s": round(t.get("cputime_ms_per_s", 0), 1),
            "intr_wk_s": round(t.get("intr_wakeups_per_s", 0), 1),
            "idle_wk_s": round(t.get("idle_wakeups_per_s", 0), 1),
            "disk_r_s": int(t.get("diskio_bytesread_per_s", 0) or 0),
            "disk_w_s": int(t.get("diskio_byteswritten_per_s", 0) or 0),
            "net_rx_s": int(t.get("bytes_received_per_s", 0) or 0),
            "net_tx_s": int(t.get("bytes_sent_per_s", 0) or 0),
            "since_ns": t.get("started_abstime_ns"),
        })
    return sys_rec, recs


def chown_to_owner(path, data_dir):
    try:
        st = os.stat(data_dir)
        os.chown(path, st.st_uid, st.st_gid)
    except OSError:
        pass


def rotate(raw_dir, data_dir):
    now = time.time()
    for f in glob.glob(os.path.join(raw_dir, "*.ndjson")):
        age_days = (now - os.path.getmtime(f)) / 86400
        if age_days > GZIP_AFTER_DAYS:
            gz = f + ".gz"
            with open(f, "rb") as src, gzip.open(gz, "wb") as dst:
                shutil.copyfileobj(src, dst)
            os.remove(f)
            chown_to_owner(gz, data_dir)
    for gz in glob.glob(os.path.join(raw_dir, "*.ndjson.gz")):
        if (now - os.path.getmtime(gz)) / 86400 > DELETE_AFTER_DAYS:
            os.remove(gz)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    args = ap.parse_args()

    raw_dir = os.path.join(args.data_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)
    chown_to_owner(raw_dir, args.data_dir)

    now = time.time()
    try:
        d = run_powermetrics()
    except Exception as e:  # never let a bad sample kill the daemon
        sys.stderr.write("collect: powermetrics failed: %r\n" % e)
        return 1

    sys_rec, recs = build_records(d, now)
    day = dt.datetime.fromtimestamp(now).strftime("%Y-%m-%d")
    path = os.path.join(raw_dir, day + ".ndjson")
    new_file = not os.path.exists(path)
    with open(path, "a") as fh:
        fh.write(json.dumps(sys_rec, separators=(",", ":")) + "\n")
        for r in recs:
            fh.write(json.dumps(r, separators=(",", ":")) + "\n")
    if new_file:
        chown_to_owner(path, args.data_dir)

    rotate(raw_dir, args.data_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
