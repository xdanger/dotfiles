# Repository Notes

## mise

- After `mise upgrade` updates `herdr`, live-migrate the running `herdr`
  sessions to the new binary:

  ```sh
  exe=$(realpath "$(mise which herdr)")
  herdr server live-handoff --import-exe "$exe"
  ```
