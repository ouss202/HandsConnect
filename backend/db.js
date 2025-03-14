<<<<<<< HEAD
/* eslint-disable no-undef */
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'handsconnect-db.c502c2oymi0m.eu-north-1.rds.amazonaws.com', // Use the Endpoint from AWS
    user: 'maj', // Your RDS Master Username
    password: 'handsconnect271', // The password you set when creating the database
    database: 'handsconnect', // Use the database name (set it if needed)
    port: 3306, // Default MySQL port
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

=======
/* eslint-disable no-undef */
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'handsconnect-db.c502c2oymi0m.eu-north-1.rds.amazonaws.com', // Use the Endpoint from AWS
    user: 'maj', // Your RDS Master Username
    password: 'handsconnect271', // The password you set when creating the database
    database: 'handsconnect', // Use the database name (set it if needed)
    port: 3306, // Default MySQL port
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

>>>>>>> main
module.exports = pool.promise();