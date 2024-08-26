const fs = require("fs");
const archiver = require("archiver");
const xbytes = require("xbytes");

// Read package.json to get the name field
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageName = packageJson.name;

// Create a write stream for the zip file
const output = fs.createWriteStream(`dist/${packageName}.zip`);
const archive = archiver("zip", {
  zlib: { level: 9 }, // Sets the compression level.
});

output.on("close", function () {
  console.log(
    `Created archive ${packageName}.zip (${xbytes(archive.pointer())})`
  );
});

output.on("end", function () {
  console.log("Data has been drained");
});

archive.on("warning", function (err) {
  if (err.code !== "ENOENT") {
    throw err;
  }
});

archive.on("error", function (err) {
  throw err;
});

archive.pipe(output);

archive.directory(`dist/${packageName}/`, false);

archive.finalize();
