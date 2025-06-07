const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

app.use("/api/pico_setting", require("./api/pico_setting"));
app.use("/api/pico_status", require("./api/pico_status"));
app.use("/api/pico_daily_report", require("./api/pico_daily_report"));


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
