const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

app.use("/api/pico_setting", require("./api/pico_setting"));
app.use("/api/pico_status", require("./api/pico_status"));
app.use("/api/pico_daily_report", require("./api/pico_daily_report"));
// MBR NHT
app.use("/api/mbr_setting", require("./api/mbr_setting"));
app.use("/api/mbr_status", require("./api/mbr_status"));
app.use("/api/mbr_daily_report", require("./api/mbr_daily_report"));
// GSSM NHT
app.use("/api/gssm_setting", require("./api/gssm_setting"));
app.use("/api/gssm_status", require("./api/gssm_status"));
app.use("/api/gssm_daily_report", require("./api/gssm_daily_report"));


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
