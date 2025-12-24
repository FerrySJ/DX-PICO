// For New Notebook
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

    // await getDailyStatusReport(dateToday);
    await NewStatusGetDailyStatusReport(dateToday); // For All M/C 
    console.log("New Running data status cron job for date:", dateToday, hours, moment().tz('Asia/Bangkok').format("YYYY-MM-DD HH:mm:ss"));
}, {
    timezone: "Asia/Bangkok"
});

const getDailyStatusReport = async (dateQuery) => {
    let dateToday = dateQuery;
    let dateTomorrow = moment(dateToday).add(1, "days").format("YYYY-MM-DD");
    console.log("Use date in getDailyStatusReport...", dateToday, dateTomorrow);

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
    AND mc_no NOT IN ('IC02R','IC03R','IC07R')
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
	AND mc_no NOT IN ('IC02R','IC03R','IC07R')
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
    [mc_status] <> 'mc_alarm'
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
            console.log("Insert Done!");
            return {
                data: data[0],
                success: true,
                message: "Update data complete",
            }
        } else {
            console.log("Can't insert : Length = 0");
        }

    } catch (error) {
        console.log("status insert error:", error);
        return {
            data: error.message,
            success: true,
            message: "Can't update data",
        }

    }
}

const NewStatusGetDailyStatusReport = async (dateQuery) => {
    let dateToday = dateQuery;
    let dateTomorrow = moment(dateToday).add(1, "days").format("YYYY-MM-DD");
    console.log("Use date in NewStatusGetDailyStatusReport...", dateToday, dateTomorrow);
    try {
        let data = await sequelize.query(
            `
        DECLARE @start_date DATETIME = '${dateToday} 07:00:00';
        DECLARE @end_date DATETIME = '${dateTomorrow} 07:00:00';
        DECLARE @start_date_p1 DATETIME = DATEADD(HOUR, -2, @start_date);    -- เวลาที่ต้องการลบไป 2hr เพื่อดึง alarm ตัวก่อนหน้า --
        DECLARE @end_date_p1 DATETIME = DATEADD(HOUR, 2, @end_date);        -- เวลาที่ต้องการบวกไป 2hr เพื่อดึง alarm ตัวหลัง --

        WITH [base_alarm] AS (
            -- เรียก data ทั้งหมด ก่อนและหลัง 1hr --
            SELECT
                [mc_no],
                [process],
                --CAST(CONVERT(VARCHAR(19), [occurred], 120) AS DATETIME) AS [occurred],    -- ปัดเศษมิลิวินาทีออก --
                [occurred],
                [alarm],
                CASE
                    WHEN RIGHT([alarm], 1) = '_' THEN LEFT([alarm], LEN([alarm]) - 1)
                    ELSE [alarm]
                END AS [alarm_base],
                CASE
                    WHEN RIGHT([alarm], 1) = '_' THEN 'after'
                    ELSE 'before'
                END AS [alarm_type]
            FROM [data_machine_gd2].[dbo].[DATA_ALARMLIS_GD]
            WHERE [occurred] BETWEEN @start_date_p1 AND @end_date_p1
        ),
        [with_pairing] AS (
            -- จับคู่ alarm กับ alarm_ --
            SELECT *,
                LEAD([occurred]) OVER (PARTITION BY [mc_no], [alarm_base] ORDER BY [occurred]) AS [occurred_next],
                LEAD([alarm_type]) OVER (PARTITION BY [mc_no], [alarm_base] ORDER BY [occurred]) AS [next_type]
            FROM [base_alarm]
        ),
        [paired_alarms] AS (
            -- filter เฉพาะตัวที่มี alarm , alarm_ และ check ตัว alarm ที่เกิดซ้อนอยู่ใน alarm อีกตัว --
            SELECT
                [mc_no],
                [process],
                [alarm_base],
                [occurred] AS [occurred_start],
                [occurred_next] AS [occurred_end]
            FROM [with_pairing]
            WHERE [alarm_type] = 'before' AND [next_type] = 'after'
        ),
        [base_monitor_iot] AS (
            SELECT
                [mc_no],
                [process],
                [registered],
                CAST(broker AS FLOAT) AS [broker_f]
            FROM [data_machine_gd2].[dbo].[MONITOR_IOT]
            WHERE registered BETWEEN @start_date_p1 AND @end_date_p1
        ),
        [mark] AS (
            SELECT
                [mc_no],
                [process],
                [registered],
                [broker_f],
                CASE WHEN [broker_f] = 0 THEN 1 ELSE 0 END AS [is_zero],
                LAG(CASE WHEN [broker_f] = 0 THEN 1 ELSE 0 END)
                    OVER (PARTITION BY [mc_no] ORDER BY [registered]) AS [prev_is_zero],
                LEAD(CASE WHEN [broker_f] = 0 THEN 1 ELSE 0 END)
                    OVER (PARTITION BY [mc_no] ORDER BY [registered]) AS [next_is_zero],
                LEAD([registered])
                    OVER (PARTITION BY [mc_no] ORDER BY [registered]) AS [next_registered]
            FROM [base_monitor_iot]
        ),
        [flagged] AS (
            SELECT
                *,
                CASE WHEN [is_zero] = 1 AND ISNULL([prev_is_zero],0) = 0 THEN 1 ELSE 0 END AS [start_flag],
                CASE WHEN [is_zero] = 1 AND ISNULL([next_is_zero],0) = 0 THEN 1 ELSE 0 END AS [end_flag]
            FROM [mark]
        ),
        [grpz] AS (
            -- เก็บเฉพาะแถวที่ broker = 0 แล้วทำ running group id สำหรับช่วงต่อเนื่อง
            SELECT
                *,
                SUM(CASE WHEN [start_flag] = 1 THEN 1 ELSE 0 END)
                    OVER (PARTITION BY [mc_no] ORDER BY [registered] ROWS UNBOUNDED PRECEDING) AS [grp]
            FROM [flagged]
            WHERE [is_zero] = 1
        ),
        [summary_connection_lose] AS (
            SELECT
                [mc_no],
                [process],
                'connection lose' AS [alarm_base],
                MIN(registered) AS [occurred_start],
                MAX(CASE WHEN [end_flag] = 1 THEN ISNULL([next_registered], [registered]) END) AS [occurred_end]
            FROM [grpz]
            GROUP BY [mc_no], [process], [grp]
        ),
        [conbine_connection_lose] AS (
            SELECT * FROM [summary_connection_lose]
            UNION ALL
            SELECT * FROM [paired_alarms]
        ),
        [with_max_prev] AS (
            SELECT *,
                MAX([occurred_end]) OVER (
                    PARTITION BY [mc_no]
                    ORDER BY [occurred_start]
                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ) AS [max_prev_end]
            FROM [conbine_connection_lose]
        ),
        [check_duplicate] AS (
            SELECT
                [mc_no],
                [process],
                [alarm_base],
                [occurred_start],
                [occurred_end],
                CASE
                    WHEN [max_prev_end] IS NOT NULL AND [occurred_end] <= [max_prev_end] THEN 1
                    ELSE 0
                END AS [duplicate]
            FROM [with_max_prev]
        ),
        [clamped_alarms] AS (
            -- ตัดตัวที่เป็น alarm ซ้อนใน alarm อีกตัวออกและเพิ่มเวลาก่อนและหลังเพื่อคำนวณ --
            SELECT
                [mc_no],
                [process],
                [alarm_base],
                [occurred_start],
                [occurred_end],
                LAG([alarm_base]) OVER (PARTITION BY [mc_no] ORDER BY [occurred_end]) AS [previous_alarm],
                LAG([occurred_end]) OVER (PARTITION BY [mc_no] ORDER BY [occurred_end]) AS [previous_occurred],
                DATEDIFF(SECOND, LAG([occurred_end]) OVER (PARTITION BY [mc_no] ORDER BY [occurred_end]), [occurred_start]) AS [previous_gap_seconds],
                LEAD([alarm_base]) OVER (PARTITION BY [mc_no] ORDER BY [occurred_start]) AS [next_alarm],
                LEAD([occurred_start]) OVER (PARTITION BY [mc_no] ORDER BY [occurred_start]) AS [next_occurred],
                DATEDIFF(SECOND, [occurred_end], LEAD([occurred_start]) OVER (PARTITION BY [mc_no] ORDER BY [occurred_start])) AS [next_gap_seconds]
            FROM [check_duplicate]
            WHERE [duplicate] = 0
        ),
        [edit_occurred] AS (
            -- filter เอาเฉพาะเวลาที่ต้องการ , ถ้า alarm = mc_run แล้วเวลาซ้อนกับ alarm ตัวอื่นจะตัดเวลา alarm ตัวนั้นออก , ถ้าเป็น alarm1 เหลื่อม alarm2 จะตัดเวลา alarm1 ออกตามที่เหลื่อม --
            SELECT
                *,
                CASE
                    WHEN [previous_gap_seconds] < 0 AND [previous_alarm] = 'mc_run' THEN [previous_occurred]
                    WHEN [previous_gap_seconds] < 0 THEN [previous_occurred]
                    ELSE [occurred_start]
                END AS [new_occurred_start]
            FROM [clamped_alarms]
        ),
        [insert_stop] AS (
            -- เพิ่มเวลา STOP เข้าไปแทนที่ช่วงเวลาที่ไม่มี alarm --
            SELECT
                [mc_no],
                [process],
                'STOP' AS [alarm_base],
                [occurred_end] AS [occurred_start],
                [next_occurred] AS [occurred_end]
            FROM [edit_occurred]
            WHERE [next_gap_seconds] > 0
        ),
        [insert_stop_end] AS (
            -- เพิ่มเวลา STOP เข้าไปแทนที่ช่วงเวลาที่ไม่มี alarm --
            SELECT
                [mc_no],
                [process],
                'STOP' AS [alarm_base],
                [occurred_end] AS [occurred_start],
                @end_date AS [occurred_end]
            FROM [edit_occurred]
            WHERE [next_gap_seconds] IS NULL
        ),
        [insert_stop_start] AS (
            -- เพิ่มเวลา STOP เข้าไปแทนที่ช่วงเวลาที่ไม่มี alarm --
            SELECT
                [mc_no],
                [process],
                'STOP' AS [alarm_base],
                @start_date AS [occurred_start],
                [new_occurred_start] AS [occurred_end]
            FROM [edit_occurred]
            WHERE [previous_gap_seconds] IS NULL
        ),
        [combine_result] AS (
            -- รวม alarm ทั้งหมดกับ STOP เข้าด้วยกัน --
            SELECT UPPER([mc_no]) AS [mc_no], UPPER([process]) AS [process], UPPER([alarm_base]) AS [alarm_base], [new_occurred_start] AS [occurred_start], [occurred_end] FROM [edit_occurred]
            --WHERE [mc_no] = 'IC04R'
            UNION ALL
            SELECT UPPER([mc_no]) AS [mc_no], UPPER([process]) AS [process], [alarm_base], [occurred_start], [occurred_end] FROM [insert_stop]
            --WHERE [mc_no] = 'IC04R'
            UNION ALL
            SELECT UPPER([mc_no]) AS [mc_no], UPPER([process]) AS [process], [alarm_base], [occurred_start], [occurred_end] FROM [insert_stop_end]
            --WHERE [mc_no] = 'IC04R'
            UNION ALL
            SELECT UPPER([mc_no]) AS [mc_no], UPPER([process]) AS [process], [alarm_base], [occurred_start], [occurred_end] FROM [insert_stop_start]
            --WHERE [mc_no] = 'IC04R'
        ),
        [edit_time_result] AS (
            -- ปัดเวลาให้เท่ากับเวลาที่ต้องการ --
            SELECT
                [mc_no],
                [process],
                [alarm_base],
                CASE 
                    WHEN [occurred_start] < @start_date THEN CAST(@start_date AS datetime)    -- ปัดเวลาหัวให้เท่ากับเวลาที่ต้องการ --
                    ELSE [occurred_start]
                END AS [occurred_start],
                CASE 
                    WHEN [occurred_end] > @end_date THEN CAST(@end_date AS datetime)    -- ปัดเวลาท้ายให้เท่ากับเวลาที่ต้องการ --
                    ELSE [occurred_end]
                END AS [occurred_end]
            FROM [combine_result]
        ),
        [filter_result] AS (
            -- หลังปัดเวลาเสร็จ filter เอาข้อมูลที่เวลาผิดทิ้ง --
            SELECT * FROM [edit_time_result]
            WHERE
                [occurred_end] > [occurred_start]
        ),
        [summary_alarm] AS (
            -- query สำหรับเตรียม data เข้า PICO --
            SELECT
                f.mc_no,
                        f.process,
                        alarm_base,
                        occurred_start,
                        occurred_end,
                CASE 
                    WHEN DATEPART(HOUR, [occurred_start]) < 7 THEN 
                        CONVERT(date, DATEADD(DAY, -1, [occurred_start]))
                    ELSE 
                        CONVERT(date, [occurred_start])
                END AS [date],
                CASE 
                    WHEN CONVERT(TIME, [occurred_start]) BETWEEN '07:00:00' AND '18:59:59' THEN 'M'
                    ELSE 'N'
                END AS [shift_mn],
                DATEDIFF(SECOND, [occurred_start], [occurred_end]) AS [duration_seconds],
                        m.line_no,
                        m.process AS process_Line
            FROM [filter_result] f
            LEFT JOIN[data_machine_gd2].[dbo].[master_mc_run_parts] m ON f.mc_no = m.mc_no
        )

        -- Pattern data PICO --
        SELECT
            [date] AS [operation_day]
            ,'true' AS [is_operation_day]
            ,UPPER([process]) AS [process]
            ,CONCAT('LINE ', line_no) AS[line_name]
            ,UPPER([mc_no]) AS [machine_name]
            ,[alarm_base] AS [status_name]
            ,SUM([duration_seconds]) AS [daily_duration_s]
            ,COUNT([alarm_base]) AS [daily_count]
            ,SUM(CASE WHEN [shift_mn] = 'M' OR [shift_mn] = 'A' THEN [duration_seconds] ELSE 0 END) AS [shift1_duration_s]
            ,SUM(CASE WHEN [shift_mn] = 'M' OR [shift_mn] = 'A' THEN 1 ELSE 0 END) AS [shift1_count]
            ,SUM(CASE WHEN [shift_mn] = 'N' OR [shift_mn] = 'B' THEN [duration_seconds] ELSE 0 END) AS [shift2_duration_s]
            ,SUM(CASE WHEN [shift_mn] = 'N' OR [shift_mn] = 'B' THEN 1 ELSE 0 END) AS [shift2_count]
            ,SUM(CASE WHEN [shift_mn] = 'C' THEN [duration_seconds] ELSE 0 END) AS [shift3_duration_s]
            ,SUM(CASE WHEN [shift_mn] = 'C' THEN 1 ELSE 0 END) AS [shift3_count]
        FROM [summary_alarm]
        GROUP BY
            [mc_no]
            ,[process]
            ,[date]
            ,[alarm_base]
        	,[line_no]
        ORDER BY [operation_day], [machine_name], [status_name]
            `
        );
        // console.log(data);
        
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
            console.log("Insert new Done!");

            return {
                data: data[0],
                success: true,
                message: "Update data complete",
            }
        } else {
            console.log("Can't new insert : Length = 0");
 
        }

    } catch (error) {
        console.log("new status insert error:", error);
        return {
            data: error.message,
            success: true,
            message: "Can't update data",
        }

    }
}


const getDaily = async (dateToday) => {
    const date = new Date(dateToday);
    const year = date.getFullYear();
    const month = date.getMonth(); // เดือนเริ่มจาก 0 (มกราคม = 0)

    // หาวันสุดท้ายของเดือนนี้
    const lastDay = new Date(year, month + 1, 0).getDate();

    // วนลูปทุกวันในเดือนนี้
    for (let day = 0; day <= lastDay; day++) {
        // สร้างวันที่ในรูปแบบ 'YYYY-MM-DD'
        const currentDate = new Date(year, month, day);
        const formatted = currentDate.toISOString().split('T')[0];
        console.log(formatted);
        await NewStatusGetDailyStatusReport(formatted);
        console.log("ok");
        // //await getDailyStatusReport(formatted);
    }
}
 
// เรียกใช้
// getDaily('2025-09-01'); 
// // getDailyStatusReport('2025-07-31');
// NewStatusGetDailyStatusReport('2025-12-23');

module.exports = router;