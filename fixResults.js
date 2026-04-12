import fs from "fs";
import path from "path";

const fix = (name) => {
  const dataString = fs.readFileSync(`./results/${name}`);
  const data = JSON.parse(dataString);
  for (let i = 0; i < data.length; i++) {
    const el = data[i];
    if (el.received !== "Vulnerable" && el.received !== "Safe") {
      if (el.received.includes("Vulnerable")) {
        data[i].received = "Vulnerable";
      } else if (el.received.includes("Safe")) {
        data[i].received = "Safe";
      } else {
        console.log(`error with: ${name} id:${el.id}`);
      }
    }
  }
  const stringFixed = JSON.stringify(data, null, 2);
  fs.writeFileSync(`./results/${name}`, stringFixed);
};

fs.readdir("./results", (err, files) => {
  if (err) {
    console.error(err);
    return;
  }

  files.forEach((file) => {
    const fullPath = path.join("./results", file);

    if (fs.lstatSync(fullPath).isFile()) {
        fix(file);
    }
  });
});
