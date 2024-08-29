const fs = require("fs");
const path = require("path");

class SetDevManifestPlugin {
  apply(compiler) {
    compiler.hooks.done.tap("SetDevManifestPlugin", () => {
      // Read package.json to get the name field
      const parentDir = path.dirname(__dirname);
      const packageJsonPath = path.join(parentDir, "package.json");

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      const packageName = packageJson.name;

      const manifestPath = path.join(
        parentDir,
        "dist",
        packageName,
        "manifest.json"
      );

      fs.readFile(manifestPath, "utf8", (err, data) => {
        if (err) {
          console.error("Error reading manifest.json:", err);
          return;
        }

        const manifest = JSON.parse(data);

        const devPostfix = " Dev";
        if (!manifest.name.endsWith(devPostfix)) {
          manifest.name = manifest.name + devPostfix;

          fs.writeFile(
            manifestPath,
            JSON.stringify(manifest, null, 2),
            "utf8",
            (err) => {
              if (err) {
                console.error("Error writing manifest.json:", err);
                return;
              }
            }
          );
          console.log(
            `Changed the name of the Chrome extension for the development environment to ${manifest.name}.`
          );
        } else {
          console.log(`Manifest name already modified to ${manifest.name}.`);
        }
      });
    });
  }
}

module.exports = SetDevManifestPlugin;
