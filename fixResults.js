import fs from "fs";
import path from "path";

const fix = (name) => {
  const dataString = fs.readFileSync(`./results/${name}`);
  const data = JSON.parse(dataString);
  
  const filtered = data.filter(el => {
    if (el.received === "Vulnerable" || el.received === "Safe") {
      return true;
    } else {
      console.log(`removed: ${name} id:${el.id}`);
      return false;
    }
  })

  const stringFixed = JSON.stringify(filtered, null, 2);
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
