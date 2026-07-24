# Flow Skill

Use this reference when the user wants to search, inspect, build, submit, test-submit, or verify an OA approval flow.

## Guardrails

- do not inspect implementation code for this workflow unless the user explicitly asks
- keep human status and machine payloads separate
- treat `commitToken` as sensitive and short-lived
- delete temporary payload files after submission
- do not submit from raw field IDs alone; show a human-readable confirmation summary first and require explicit confirmation
- if the user only wants field inspection or payload preparation, stop before submit

## Standard workflow

1. Find the flow:

```bash
xdoa flow search "<flow name>"
```

Extract the segment after `/approval/` from the workflow URL.

2. Build the empty payload template:

```bash
xdoa flow build <flow_id>
```

3. Inspect the form:

```bash
xdoa flow form <flow_id> --json
```

4. Create a temporary `values.json` mapping field IDs to desired values

- fill all required fields
- leave optional upload fields empty unless the user supplied files

5. Build the final payload:

```bash
xdoa flow build <flow_id> --values <values.json> > <payload.json>
```

6. Before any real submit, show a confirmation summary that includes:

- flow name and flow ID
- each human-visible field label and value
- any optional fields left blank, especially upload fields
- the exact submit command

7. Submit only after explicit confirmation:

```bash
xdoa flow submit <flow_id> --data-file <payload.json>
```

8. Verify the result:

```bash
xdoa flow get task -t submit --query="pageNum=1&pageSize=5&instanceStatus="
```

9. Delete temporary files:

```bash
rm <values.json> <payload.json>
```

## Branch boundaries

- If the user only wants to know policy, eligibility, or which flow to use, answer with documents first and only switch here for actual flow work
- If the user asks for a real submission, require explicit confirmation after the human-readable summary
- If the user asks for a dry run or test-submit, prepare the payload and stop at the point the user requested

## Confirmation summary template

```text
准备提交流程，请确认：

流程：<flow name>
Flow ID：<flow_id>

表单值：
- <字段名 1>：<值>
- <字段名 2>：<值>
- <可选字段>：<空/未填写>

将执行：
xdoa flow submit <flow_id> --data-file <payload.json>

请回复“确认提交”后我再提交。
```

## Success report

After submission, report only the important result:

- `POST flow 200` or the exact failure
- approval title, status, approval code, time, and link from the latest `flow get task -t submit` output when available
- whether temporary files were deleted
