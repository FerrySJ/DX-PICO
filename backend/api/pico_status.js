const express = require("express");
const sequelize = require("../instance/db");
const cron = require('node-cron');
const moment = require('moment-timezone');

const router = express.Router();

cron.schedule('1 7 * * *', async () => {
    let dateToday;
    const hours = parseInt(moment().tz('Asia/Bangkok').format('HH'), 10);

    if (hours <= 7) {
        dateToday = moment().tz('Asia/Bangkok').subtract(1, "days").format("YYYY-MM-DD");
    } else {
        dateToday = moment().tz('Asia/Bangkok').format("YYYY-MM-DD");
    }

    await getDailyStatusReport(dateToday);
    console.log("Running data status cron job for date:", dateToday, hours, moment().tz('Asia/Bangkok').format("YYYY-MM-DD HH:mm:ss"));
}, {
    timezone: "Asia/Bangkok"
});

const getDailyStatusReport = async (dateQuery) => {
    dateToday = dateQuery;
    let dateTomorrow = moment(dateToday).add(1, "days").format("YYYY-MM-DD");
    console.log(dateToday, dateTomorrow);

    try {
        let data = await sequelize.query(
    `
    WITH[base_logs] AS (
        SELECT
    [mc_no],
    [alarm],
    [process],
    [occurred],
            CASE WHEN
            RIGHT ([alarm],
                1) = '_' THEN
            LEFT ([alarm],
                LEN ([alarm]) - 1)
            ELSE
    [alarm]
            END AS[alarm_base],
            CASE WHEN
            RIGHT ([alarm],
                1) = '_' THEN
                'after'
            ELSE
                'before'
            END AS[check_type]
        FROM
    [data_machine_gd2].[dbo].[DATA_ALARMLIS_GD]
        WHERE
    [occurred] BETWEEN '${dateToday} 07:00' AND '${dateTomorrow} 07:00'
    ),
    [ordered_logs] AS (
        SELECT
            *,
            ROW_NUMBER() OVER (PARTITION BY[alarm_base] ORDER BY[occurred]) AS[rn]
    FROM
    [base_logs]
    ),
    [next_type_flagged] AS (
        SELECT
    [ol].*,
            LEAD([check_type]) OVER (PARTITION BY[alarm_base] ORDER BY[occurred]) AS[next_type],
        LEAD([occurred]) OVER (PARTITION BY[alarm_base] ORDER BY[occurred]) AS[occurred_after]
    FROM
    [ordered_logs][ol]
    ),
    [filtered_for_match] AS (
        SELECT
    [mc_no],
    [process],
    [alarm_base],
    [occurred] AS[occurred_before],
    [occurred_after]
        FROM
    [next_type_flagged]
        WHERE
    [check_type] = 'before'
            AND[next_type] = 'after'
    ),
    [all_alarm] AS (
        SELECT
            CASE WHEN DATEPART (HOUR, occurred_before) < 7 THEN
                CONVERT(date, DATEADD (DAY, -1, occurred_before))
            ELSE
                CONVERT(date, occurred_before)
            END AS[date],
            CASE WHEN CONVERT(TIME, occurred_before) BETWEEN '07:00:00' AND '18:59:59' THEN
                'M'
            ELSE
                'N'
            END AS[shift_mn],
    [process],
            UPPER(
            RIGHT ([mc_no], 1)) AS[machine_type],
        UPPER([mc_no]) AS[mc_no],
        UPPER([alarm_base]) AS[alarm],
    [occurred_before],
    [occurred_after],
        DATEDIFF (SECOND,[occurred_before],[occurred_after]) AS[duration_seconds]
    FROM
    [filtered_for_match]
    ),
    [base_logs_status] AS (
        SELECT
    [occurred],
    [mc_status],
    [process],
    [mc_no],
            COALESCE(LEAD([occurred]) OVER (PARTITION BY[mc_no] ORDER BY[occurred]), NULL) AS[occurred_after]
        FROM
    [data_machine_gd2].[dbo].[DATA_MCSTATUS_GD]
        WHERE
    [occurred] BETWEEN '${dateToday} 07:00' AND '${dateTomorrow} 07:00'
    ),
    [all_alarm_status] AS (
        SELECT
            CASE WHEN DATEPART (HOUR,[occurred]) < 7 THEN
                CONVERT(date, DATEADD (DAY, -1,[occurred]))
            ELSE
                CONVERT(date,[occurred])
            END AS[date],
            CASE WHEN CONVERT(TIME,[occurred]) BETWEEN '07:00:00' AND '18:59:59' THEN
                'M'
            ELSE
                'N'
            END AS[shift_mn],
    [process],
            UPPER(
            RIGHT ([mc_no], 1)) AS[machine_type],
            UPPER([mc_no]) AS[mc_no],
            UPPER(
            RIGHT ([mc_status], LEN ([mc_status]) - 3)) AS[alarm],
    [occurred] AS[occurred_before],
    [occurred_after],
            DATEDIFF (SECOND,[occurred],[occurred_after]) AS[duration_seconds]
        FROM
    [base_logs_status]
        WHERE
    [mc_status] <> 'mc_run'
            AND[mc_status] <> 'mc_alarm'
    ),
    data_result AS (
        SELECT
    [date],
            process,
    [shift_mn],
            CASE WHEN[machine_type] = 'B' THEN
                'BORE'
            WHEN[machine_type] = 'R' THEN
                'RACEWAY'
            WHEN[machine_type] = 'H' THEN
                'SUPERFINISH'
            ELSE
                NULL
            END AS[machine_type],
    [mc_no],
    [alarm],
            SUM([duration_seconds]) AS[total_seconds],
            COUNT([alarm]) AS[count]
        FROM
    [all_alarm]
        WHERE
    [alarm] <> 'GE-ON'
        GROUP BY
    [mc_no],
    [machine_type],
    [date],
    [shift_mn],
    [alarm],
            process
        UNION ALL
        SELECT
    [date],
    [process],
    [shift_mn],
            CASE WHEN[machine_type] = 'B' THEN
                'BORE'
            WHEN[machine_type] = 'R' THEN
                'RACEWAY'
            WHEN[machine_type] = 'H' THEN
                'SUPERFINISH'
            ELSE
                NULL
            END AS[machine_type],
    [mc_no],
    [alarm] AS status_name,
            SUM([duration_seconds]) AS[total_seconds],
            COUNT([alarm]) AS[count]
        FROM
    [all_alarm_status]
        GROUP BY
    [mc_no],
    [machine_type],
    [date],
    [shift_mn],
    [process],
    [alarm])
    SELECT
        date AS operation_day,
        'true' AS is_operation_day,
        UPPER(data_result.[process]) AS process,
        CONCAT('LINE ', line_no) AS line_name,
        data_result.mc_no AS machine_name,
        alarm AS status_name,
        ISNULL (SUM(total_seconds),
            0) AS daily_duration_s,
        ISNULL (COUNT(*),
            0) AS daily_count,
        ISNULL (SUM(
                CASE WHEN shift_mn IN ('M', 'A') THEN
                    total_seconds
                ELSE
                    0
                END),
            0) AS shift1_duration_s,
        ISNULL (COUNT(
                CASE WHEN shift_mn IN ('M', 'A') THEN
                    1
                END),
            0) AS shift1_count,
        ISNULL (SUM(
                CASE WHEN shift_mn IN ('N', 'B') THEN
                    total_seconds
                ELSE
                    0
                END),
            0) AS shift2_duration_s,
        ISNULL (COUNT(
                CASE WHEN shift_mn IN ('N', 'B') THEN
                    1
                END),
            0) AS shift2_count,
        ISNULL (SUM(
                CASE WHEN shift_mn = 'C' THEN
                    total_seconds
                ELSE
                    0
                END),
            0) AS shift3_duration_s,
        ISNULL (COUNT(
                CASE WHEN shift_mn = 'C' THEN
                    1
                END),
            0) AS shift3_count
    FROM
        data_result
        LEFT JOIN[data_machine_gd2].[dbo].[master_mc_run_parts] m ON data_result.mc_no = m.mc_no
    GROUP BY
        date,
        line_no,
        data_result.mc_no,
        alarm,
        data_result.process
    ORDER BY
        operation_day,
        machine_name,
        status_name
    `
        );
        // STEP INSERT DATA
        if (data[0].length > 0) {
            const result = data[0]
            for (let index = 0; index < result.length; index++) {
                await sequelize.query(
                    `
            INSERT INTO[NHT_DX_TO_PICO].[dbo].[GD2ND_DAILY_STATUS_REPORT] ([operation_day],[is_operation_day],[process],[line_name],[machine_name],[status_name],[daily_duration_s],[daily_count],[shift1_duration_s],[shift1_count],[shift2_duration_s],[shift2_count],[shift3_duration_s],[shift3_count],[registered_at])
            SELECT
                '${result[index].operation_day}',
                '${result[index].is_operation_day}',
                '${result[index].process}',
                '${result[index].line_name}',
                '${result[index].machine_name}',
                '${result[index].status_name}',
                ${result[index].daily_duration_s},
                ${result[index].daily_count},
                ${result[index].shift1_duration_s},
                ${result[index].shift1_count},
                ${result[index].shift2_duration_s},
                ${result[index].shift2_count},
                ${result[index].shift3_duration_s},
                ${result[index].shift3_count},
                GETDATE ()
            WHERE
                NOT EXISTS (
                    SELECT
                        1
                    FROM
            [NHT_DX_TO_PICO].[dbo].[GD2ND_DAILY_STATUS_REPORT]
                    WHERE
            [operation_day] = '${result[index].operation_day}'
                        AND [line_name] = '${result[index].line_name}'
                        AND [machine_name] = '${result[index].machine_name}'
                        AND [status_name] = '${result[index].status_name}'
                        AND [daily_duration_s] = ${result[index].daily_duration_s}
                        AND [daily_count] = ${result[index].daily_count});

`
                );
            }
            return {
                data: data[0],
                success: true,
                message: "Update data complete",
            }
        }

    } catch (error) {
        console.log("status insert error:" , error);
        return {
            data: error.message,
            success: true,
            message: "Can't update data",
        }

    }
}


module.exports = router;