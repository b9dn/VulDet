import fs from "fs";
import csv from "fast-csv";
import sqlite from "sqlite3";

const DATA_NUM = 400;

const db = new sqlite.Database("../formatted_data/data.sqlite");

db.run(`CREATE TABLE IF NOT EXISTS data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    isVulnerable BOOLEAN
)`);

let currentSafeNum = 0;
let currentVulNnum = 0;

const stream = fs
  .createReadStream("data.csv")
  .pipe(csv.parse({ headers: true }))
  .on("data", (row) => {
    // if (row.code.length > 1000) {
    //   return;
    // }
    if (row.target === "0" && currentSafeNum < DATA_NUM) {
      db.run(`INSERT INTO data (code, isVulnerable) VALUES (?, ?)`, [
        row.code,
        +row.target,
      ]);
      currentSafeNum++;
    }
    if (row.target === "1" && currentVulNnum < DATA_NUM) {
      db.run(`INSERT INTO data (code, isVulnerable) VALUES (?, ?)`, [
        row.code,
        +row.target,
      ]);
      currentVulNnum++;
    }

    if (currentVulNnum >= DATA_NUM && currentSafeNum >= DATA_NUM) {
      stream.destroy();
    }
  });
