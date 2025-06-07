//Reference
const Sequelize = require("sequelize");
//=========================================================
const sequelize = new Sequelize("NHT_DX_TO_PICO", "sa", "Nhtsa@admin", {
  host: "10.128.16.207", // ถ้า connect db ไม่ได้ (ข้อมูลต้องใส่ถูกแล้วด้วย) ให้เปลี่ยนเป็นน "host"
  timezone: 'utc+7',
  dialect: "mssql",
  
  logging: false,
  dialectOptions: {
    keepAlive: true, // Enables connection keep-alive
    connectTimeout: 600000, // 60 seconds
    options: {
      instanceName: "",
      encrypt: false,
      requestTimeout: 30000, // เพิ่ม timeout เป็น 30 วินาที

    },
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 60000, // 60 seconds
    idle: 10000,
  },
});

(async () => {
  await sequelize.authenticate();
})();
module.exports = sequelize;
