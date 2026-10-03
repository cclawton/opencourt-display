# Pilot operations

OpenCourt keeps operational monitoring deliberately small. The control room is the fleet view: each TV reports its last connection time, software and hardware details, network address and current content. CloudWatch is the service view: the `opencourt-heatherdale-pilot-operations` dashboard graphs API traffic, errors, throttles, p95 duration and maximum concurrency over 14 days.

## Club installation check

After each Pi has been powered at the club:

1. Open **Displays** in the control room and confirm both **Bar Room TV** and **Kitchen TV** have connected within the last few minutes.
2. Open each TV's information panel and confirm its expected hostname, network address and software details.
3. Confirm **Currently showing** matches the scheduled content and includes `(Schedule)`.
4. Use **Refresh TV** once and confirm the displayed Google Slides reload.
5. Open the CloudWatch dashboard and confirm requests are arriving without new errors or throttles.

Find the deployed dashboard name at any time:

```bash
aws cloudformation describe-stacks \
  --stack-name OpenCourtControl \
  --region ap-southeast-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`OperationsDashboardName`].OutputValue' \
  --output text
```

In the AWS console, choose **CloudWatch → Dashboards → opencourt-heatherdale-pilot-operations** and select the desired time range. The dashboard defaults to 14 days.

## What healthy looks like

- Both displays keep updating their last connection time. A stale time is primarily a Pi, power, Wi-Fi or clubhouse internet issue.
- `Errors` and `Throttles` stay at zero. One isolated error can be investigated by timestamp; repeated errors need a code or dependency review.
- `ConcurrentExecutions` stays comfortably below the reserved limit of ten.
- p95 `Duration` remains well below the five-second Lambda timeout. Compare changes with the prior week rather than treating one cold start as a fault.
- Invocations form a steady baseline from the one-minute device polling, with extra short bursts when people use the control room.

The dashboard uses AWS-provided Lambda metrics. It creates no custom metrics and sends no synthetic requests. Routine successful requests are intentionally not application-logged. Lambda writes structured JSON only for unexpected application errors and platform warnings/errors, retained for 14 days.

## Investigating a fault

For a timestamp shown on the dashboard, open **CloudWatch → Logs Insights**, select `/aws/lambda/opencourt-heatherdale-pilot-control-api`, set the matching time range and run:

```text
fields @timestamp, @message, @requestId
| filter level = "ERROR" or level = "WARN"
| sort @timestamp desc
| limit 100
```

Do not use Live Tail for routine monitoring. A bounded Logs Insights query is easier to correlate and avoids an open-ended session.

Authenticated display changes are recorded separately in the retained DynamoDB audit table. To list the latest changes for one device, first read `AuditTableName` from the stack outputs, then run:

```bash
aws dynamodb query \
  --table-name TABLE_NAME_FROM_STACK_OUTPUTS \
  --region ap-southeast-2 \
  --key-condition-expression 'deviceId = :deviceId' \
  --expression-attribute-values '{":deviceId":{"S":"honours-board-tv"}}' \
  --scan-index-forward false \
  --limit 20
```

Use `court-allocation-tv` for the Kitchen TV. The audit record shows the time, action and authenticated actor without storing login codes or credentials.

## One-to-two-week review

Review a full 14-day dashboard range and record:

- whether either display had a stale last connection time or needed a manual restart;
- total Lambda errors and throttles, plus the cause of each non-zero period;
- p95 duration and maximum concurrency compared with the baseline;
- whether schedules changed at the expected Melbourne times;
- operator actions from the audit table and any user confusion reported; and
- AWS month-to-date cost against the USD $1, $5 and $10 budget notifications.

Keep the 14-day logs only while they remain sufficient for the review cadence. The retained audit table is the durable record of user changes; CloudWatch logs are diagnostic data, not an activity history.
