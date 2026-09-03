const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASSWORD)
});

module.exports = pool;

pool.on("connect",()=>{
    console.log("connected to PostgreSQL");
});

pool.on("error",(err)=>{
    console.log("PostgreSQL erorr:",err);
    
});

module.exports=pool;