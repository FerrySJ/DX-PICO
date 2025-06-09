const express = require("express");
const sequelize = require("../instance/db");
// const schedule = require("node-schedule");
// const moment = require("moment");
const cron = require('node-cron');
const moment = require('moment-timezone');

const router = express.Router();

cron.schedule('0 10 * * *', async () => {
    let dateToday;
    const hours = parseInt(moment().tz('Asia/Bangkok').format('HH'), 10);

    if (hours <= 7) {
        dateToday = moment().tz('Asia/Bangkok').subtract(1, "days").format("YYYY-MM-DD");
    } else {
        dateToday = moment().tz('Asia/Bangkok').format("YYYY-MM-DD");
    }

    let dataDailyStatusReport = await getDailySettingReport(dateToday);
    console.log("Running cron job for date:", dateToday, hours, moment().format("HH:mm:ss"));
}, {
    timezone: "Asia/Bangkok"
});
// schedule.scheduleJob("-0 7 * * *", async () => {
//     let dateToday;
//     let hours = parseInt(moment().format("HH"), 10);
//     if (hours <= 7) {
//         dateToday = moment().subtract(1, "days").format("YYYY-MM-DD");
//     } else {
//         dateToday = moment().format("YYYY-MM-DD");
//     }

//     let dataDailyStatusReport = await getDailySettingReport(dateToday);
//     console.log("Running task at:", moment().format("YYYY-MM-DD HH:mm:ss"));
//     console.log(dataDailyStatusReport);
// });

const getDailySettingReport = async (dateQuery) => {
    dateToday = dateQuery;
    let dateTomorrow = moment(dateToday).add(1, "days").format("YYYY-MM-DD");
    console.log(dateToday, dateTomorrow);

    try {
        let data = await sequelize.query(
            `SELECT
            'GD' AS[process],
            CONCAT('LINE ', line_no) AS line_no,
        [mc_no],
            CASE WHEN mc_no LIKE '%B' THEN
                1
            WHEN mc_no LIKE '%R' THEN
                2
            WHEN mc_no LIKE '%H' THEN
                3
            ELSE
                1
            END AS [mc_order],
            '7:00:00' AS shift_start,
            1 AS count_f,
            CASE WHEN mc_no LIKE 'IC-52%'
                OR mc_no LIKE 'IR58%'
                OR mc_no LIKE 'IR64%'
                OR mc_no LIKE 'OC24H%'
                OR mc_no LIKE 'OC45H%' THEN
                2000
            WHEN mc_no LIKE 'IC01%'
                OR mc_no LIKE 'IC02%'
                OR mc_no LIKE 'IC03%'
                OR mc_no LIKE 'IC04%'
                OR mc_no LIKE 'IC05%'
                OR mc_no LIKE 'IC06%'
                OR mc_no LIKE 'IC07%'
                OR mc_no LIKE 'IC08%'
                OR mc_no LIKE 'IC09%'
                OR mc_no LIKE 'IC10%'
                OR mc_no LIKE 'IC11%'
                OR mc_no LIKE 'IC12%'
                OR mc_no LIKE 'IC13%'
                OR mc_no LIKE 'IC14%'
                OR mc_no LIKE 'IC15%'
                OR mc_no LIKE 'IC16%'
                OR mc_no LIKE 'IC18%'
                OR mc_no LIKE 'IC19%'
                OR mc_no LIKE 'IC21%'
                OR mc_no LIKE 'IC23%'
                OR mc_no LIKE 'IC24%'
                OR mc_no LIKE 'IC25%'
                OR mc_no LIKE 'IC26%'
                OR mc_no LIKE 'IC27%'
                OR mc_no LIKE 'IC28%'
                OR mc_no LIKE 'IC29%'
                OR mc_no LIKE 'IC30%'
                OR mc_no LIKE 'IC31%'
                OR mc_no LIKE 'IC33%'
                OR mc_no LIKE 'IC34%'
                OR mc_no LIKE 'IC35%'
                OR mc_no LIKE 'IC36%'
                OR mc_no LIKE 'IC37%'
                OR mc_no LIKE 'IC38%'
                OR mc_no LIKE 'IC39%'
                OR mc_no LIKE 'IC40%'
                OR mc_no LIKE 'IC41%'
                OR mc_no LIKE 'IC42%'
                OR mc_no LIKE 'IC43%'
                OR mc_no LIKE 'IC45%'
                OR mc_no LIKE 'IC46%'
                OR mc_no LIKE 'IC47%'
                OR mc_no LIKE 'IC48%'
                OR mc_no LIKE 'IC49%'
                OR mc_no LIKE 'IC50%'
                OR mc_no LIKE 'IC51%'
                OR mc_no LIKE 'IR44%'
                OR mc_no LIKE 'IR46%'
                OR mc_no LIKE 'IR47%'
                OR mc_no LIKE 'IR48%'
                OR mc_no LIKE 'IR50%'
                OR mc_no LIKE 'IR51%'
                OR mc_no LIKE 'IR52%'
                OR mc_no LIKE 'IR54%'
                OR mc_no LIKE 'IR55%'
                OR mc_no LIKE 'IR56%'
                OR mc_no LIKE 'IR57%'
                OR mc_no LIKE 'IR59%'
                OR mc_no LIKE 'IR60%'
                OR mc_no LIKE 'IR61%' THEN
                2370
            WHEN mc_no LIKE 'IC17%'
                OR mc_no LIKE 'IC32%'
                OR mc_no LIKE 'IR49%'
                OR mc_no LIKE 'IR53%' THEN
                2600
            WHEN mc_no LIKE 'IC20%'
                OR mc_no LIKE 'IC22%' THEN
                3400
            ELSE
                NULL
            END AS ct
        FROM
            [data_machine_gd2].[dbo].[master_mc_run_parts]
            `
           )
           
        // STEP INSERT DATA
        if (data[0].length > 0) {
            const result = data[0]
            for (let index = 0; index < result.length; index++) {
                await sequelize.query(
                    `
            INSERT INTO [NHT_DX_TO_PICO].[dbo].[SETTING] ([process], [line_name], [machine_name], [machine_order], [shift1_start_time], [count_factor], [target_cycle_time_ms], [registered_at])
            SELECT
                '${result[index].process}',
                '${result[index].line_no}',
                '${result[index].mc_no}',
                '${result[index].mc_order}',
                '${result[index].shift_start}',
                '${result[index].count_f}',
                ${result[index].ct},
                GETDATE ()
            WHERE
                NOT EXISTS (
                    SELECT
                        1
                    FROM
            [NHT_DX_TO_PICO].[dbo].[DAILY_STATUS_REPORT]
                    WHERE
            [line_name] = '${result[index].line_no}'
                        AND [machine_name] = '${result[index].mc_no}'
                        AND [machine_order] = '${result[index].mc_order}'
                        AND [shift1_start_time] = '${result[index].shift_start}'
                        AND [count_factor] = ${result[index].count_f}
                        AND [target_cycle_time_ms] = ${result[index].ct});

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



router.get("gd_setting_to_insert", async(res,req) =>{
try {
   let data = await sequelize.query(
    `SELECT
    'GD' AS[process],
    CONCAT('LINE ', line_no) AS line_no,
[mc_no],
    CASE WHEN mc_no LIKE '%B' THEN
        1
    WHEN mc_no LIKE '%R' THEN
        2
    WHEN mc_no LIKE '%H' THEN
        3
    ELSE
        1
    END AS [mc_order],
    '7:00:00' AS shift_start,
    1 AS count_f,
    CASE WHEN mc_no LIKE 'IC-52%'
        OR mc_no LIKE 'IR58%'
        OR mc_no LIKE 'IR64%'
        OR mc_no LIKE 'OC24H%'
        OR mc_no LIKE 'OC45H%' THEN
        2000
    WHEN mc_no LIKE 'IC01%'
        OR mc_no LIKE 'IC02%'
        OR mc_no LIKE 'IC03%'
        OR mc_no LIKE 'IC04%'
        OR mc_no LIKE 'IC05%'
        OR mc_no LIKE 'IC06%'
        OR mc_no LIKE 'IC07%'
        OR mc_no LIKE 'IC08%'
        OR mc_no LIKE 'IC09%'
        OR mc_no LIKE 'IC10%'
        OR mc_no LIKE 'IC11%'
        OR mc_no LIKE 'IC12%'
        OR mc_no LIKE 'IC13%'
        OR mc_no LIKE 'IC14%'
        OR mc_no LIKE 'IC15%'
        OR mc_no LIKE 'IC16%'
        OR mc_no LIKE 'IC18%'
        OR mc_no LIKE 'IC19%'
        OR mc_no LIKE 'IC21%'
        OR mc_no LIKE 'IC23%'
        OR mc_no LIKE 'IC24%'
        OR mc_no LIKE 'IC25%'
        OR mc_no LIKE 'IC26%'
        OR mc_no LIKE 'IC27%'
        OR mc_no LIKE 'IC28%'
        OR mc_no LIKE 'IC29%'
        OR mc_no LIKE 'IC30%'
        OR mc_no LIKE 'IC31%'
        OR mc_no LIKE 'IC33%'
        OR mc_no LIKE 'IC34%'
        OR mc_no LIKE 'IC35%'
        OR mc_no LIKE 'IC36%'
        OR mc_no LIKE 'IC37%'
        OR mc_no LIKE 'IC38%'
        OR mc_no LIKE 'IC39%'
        OR mc_no LIKE 'IC40%'
        OR mc_no LIKE 'IC41%'
        OR mc_no LIKE 'IC42%'
        OR mc_no LIKE 'IC43%'
        OR mc_no LIKE 'IC45%'
        OR mc_no LIKE 'IC46%'
        OR mc_no LIKE 'IC47%'
        OR mc_no LIKE 'IC48%'
        OR mc_no LIKE 'IC49%'
        OR mc_no LIKE 'IC50%'
        OR mc_no LIKE 'IC51%'
        OR mc_no LIKE 'IR44%'
        OR mc_no LIKE 'IR46%'
        OR mc_no LIKE 'IR47%'
        OR mc_no LIKE 'IR48%'
        OR mc_no LIKE 'IR50%'
        OR mc_no LIKE 'IR51%'
        OR mc_no LIKE 'IR52%'
        OR mc_no LIKE 'IR54%'
        OR mc_no LIKE 'IR55%'
        OR mc_no LIKE 'IR56%'
        OR mc_no LIKE 'IR57%'
        OR mc_no LIKE 'IR59%'
        OR mc_no LIKE 'IR60%'
        OR mc_no LIKE 'IR61%' THEN
        2370
    WHEN mc_no LIKE 'IC17%'
        OR mc_no LIKE 'IC32%'
        OR mc_no LIKE 'IR49%'
        OR mc_no LIKE 'IR53%' THEN
        2600
    WHEN mc_no LIKE 'IC20%'
        OR mc_no LIKE 'IC22%' THEN
        3400
    ELSE
        NULL
    END AS ct
FROM
    [data_machine_gd2].[dbo].[master_mc_run_parts]
    `
   )
} catch (error) {
    console.log(error.message);
    
}
})

module.exports = router;
