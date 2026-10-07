# Project time convention

BrightBuy uses Texas Central Time (`America/Chicago`) for displayed timestamps and business calendar dates. IANA timezone rules handle CST/CDT automatically. The shared implementation is `shared/time.js`.

- Store timestamps in UTC and return ISO timestamps with a UTC offset. Database sessions generating timestamps use UTC.
- Display inventory movements, order/payment history and registration dates in Central Time, independently of the viewer's computer timezone.
- Interpret report date ranges and quarterly boundaries as Central Time calendar periods. Convert the start/end boundaries to UTC before filtering stored timestamps. Report responses identify their timezone as `America/Chicago`.
- Create delivery/pickup estimates from the Central Time date of the stored order timestamp plus 5/7 calendar days, with 3 extra days for initial stock shortage. Calendar days include weekends and public holidays.
- Record completion dates and determine overdue status using the current Central calendar date.
- Delivery estimates and actual dates are calendar-only `YYYY-MM-DD` values. Display them without timezone conversion. Keep existing stored dates and original estimates unchanged.

This adopts the SRS Central Time default and the team's later calendar-day decision. The original SRS business-day wording and older UTC-period guide wording should be updated in the final project documentation.
