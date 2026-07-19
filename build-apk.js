// Genera y firma el APK a partir del Web Manifest de la web.
// Requiere ~/.bubblewrap/config.json con jdkPath y androidSdkPath ya configurados
// (ver README.md), y las variables de entorno KEYSTORE_PASSWORD / KEY_PASSWORD.
const path = require("path");
const fs = require("fs");
const execFile = require("util").promisify(require("child_process").execFile);
const {
    TwaManifest,
    Config,
    JdkHelper,
    AndroidSdkTools,
    GradleWrapper,
    KeyTool,
    ConsoleLog,
} = require("@bubblewrap/core");
const { updateProject } = require("@bubblewrap/cli/dist/lib/cmds/shared");

const MANIFEST_URL = "https://evens-team-pagina-web-production.up.railway.app/static/manifest.json";
const PACKAGE_ID = "com.evensteam.panel";
const KEYSTORE_PATH = "./android.keystore";
const KEY_ALIAS = "evensteam";
const KEYSTORE_PASSWORD = process.env.KEYSTORE_PASSWORD;
const KEY_PASSWORD = process.env.KEY_PASSWORD;
const BUILD_TOOLS_VERSION = "34.0.0";
// Marca en la URL de arranque para que la web sepa que la peticion viene de
// esta app y no de un navegador cualquiera (ver app.before_request en el
// Flask). El web manifest normal no trae esto, asi que se fija a mano
// despues de generar el TWA manifest desde el.
const START_URL = "/?origen=app-android";
const APP_VERSION_NAME = "0.0.1";
const APP_VERSION_CODE = 1;

if (!KEYSTORE_PASSWORD || !KEY_PASSWORD) {
    console.error("Faltan las variables de entorno KEYSTORE_PASSWORD y/o KEY_PASSWORD.");
    process.exit(1);
}

class AutoPrompt {
    async printMessage(message) {
        console.log(message);
    }
    async promptInput(message, defaultValue, validateFunction) {
        return (await validateFunction(defaultValue)).unwrap();
    }
    async promptChoice(message, choices, defaultValue, validateFunction) {
        return (await validateFunction(defaultValue)).unwrap();
    }
    async promptConfirm() {
        return true;
    }
    async promptPassword(message, validateFunction) {
        return (await validateFunction(KEYSTORE_PASSWORD)).unwrap();
    }
    async downloadFile() {
        throw new Error("downloadFile no deberia hacer falta, SDK/JDK ya configurados");
    }
}

async function main() {
    const prompt = new AutoPrompt();
    const log = new ConsoleLog("build-apk");

    const configPath = path.join(require("os").homedir(), ".bubblewrap", "config.json");
    const config = await Config.loadConfig(configPath);
    if (!config) throw new Error("No se encontro ~/.bubblewrap/config.json - ver README.md");

    console.log("== Generando TWA manifest desde el Web Manifest ==");
    const manifestUrl = new URL(MANIFEST_URL);
    const twaManifest = await TwaManifest.fromWebManifest(MANIFEST_URL);
    twaManifest.packageId = PACKAGE_ID;
    twaManifest.signingKey = { path: KEYSTORE_PATH, alias: KEY_ALIAS };
    twaManifest.webManifestUrl = manifestUrl;
    twaManifest.startUrl = START_URL;
    twaManifest.appVersionName = APP_VERSION_NAME;
    twaManifest.appVersionCode = APP_VERSION_CODE;

    const err = twaManifest.validate();
    if (err) throw new Error("twa-manifest invalido: " + err);

    const manifestFile = path.join(process.cwd(), "twa-manifest.json");
    await twaManifest.saveToFile(manifestFile);
    console.log("twa-manifest.json guardado:", manifestFile);

    if (!fs.existsSync(KEYSTORE_PATH)) {
        console.log("== Generando clave de firma (android.keystore) ==");
        const jdkHelper = new JdkHelper(process, config);
        const keyTool = new KeyTool(jdkHelper, log);
        await keyTool.createSigningKey({
            path: KEYSTORE_PATH,
            alias: KEY_ALIAS,
            keypassword: KEY_PASSWORD,
            password: KEYSTORE_PASSWORD,
            fullName: "EVEN's Team",
            organizationalUnit: "EVEN's Team",
            organization: "EVEN's Team",
            country: "ES",
        });
        console.log("Clave generada:", KEYSTORE_PATH);
    } else {
        console.log("Ya existe android.keystore, no se regenera (misma clave que las versiones anteriores).");
    }

    console.log("== Generando proyecto Android desde el manifest ==");
    await updateProject(true, null, prompt, process.cwd(), manifestFile);

    console.log("== Compilando el APK (gradle assembleRelease) ==");
    const jdkHelper2 = new JdkHelper(process, config);
    const androidSdkTools = await AndroidSdkTools.create(process, config, jdkHelper2, log);
    if (!(await androidSdkTools.checkBuildTools())) {
        await androidSdkTools.installBuildTools();
    }
    const gradleWrapper = new GradleWrapper(process, androidSdkTools, process.cwd());
    // NoDefaultCurrentDirectoryInExePath puede estar activado en Windows, lo
    // que hace que cmd.exe no encuentre gradlew.bat sin ruta completa. Se fuerza la ruta
    // absoluta para evitarlo, sin depender de esa configuracion del sistema.
    gradleWrapper.gradleCmd = path.join(process.cwd(), process.platform === "win32" ? "gradlew.bat" : "gradlew");
    await gradleWrapper.assembleRelease();

    const apkBuildOutput = path.join(process.cwd(), "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk");
    const apkAligned = path.join(process.cwd(), "app-release-unsigned-aligned.apk");
    const apkSigned = path.join(process.cwd(), "app-release-signed.apk");

    console.log("== zipalign ==");
    await androidSdkTools.zipalignOnlyVerification(apkBuildOutput);
    fs.copyFileSync(apkBuildOutput, apkAligned);

    console.log("== Firmando el APK ==");
    // No se usa androidSdkTools.apksigner() porque en Windows invoca java.exe via
    // shell:true, y si la ruta del JDK tiene espacios (ej. "Program Files") rompe el
    // parseo de cmd.exe. Se llama directo con execFile sin shell, que no tiene ese problema.
    const javaExe = path.join(config.jdkPath, "bin", process.platform === "win32" ? "java.exe" : "java");
    const apksignerJar = path.join(config.androidSdkPath, "build-tools", BUILD_TOOLS_VERSION, "lib", "apksigner.jar");
    await execFile(javaExe, [
        "-Xmx1024M", "-Xss1m", "-jar", apksignerJar,
        "sign",
        "--ks", KEYSTORE_PATH,
        "--ks-key-alias", KEY_ALIAS,
        "--ks-pass", `pass:${KEYSTORE_PASSWORD}`,
        "--key-pass", `pass:${KEY_PASSWORD}`,
        "--out", apkSigned,
        apkAligned,
    ]);

    console.log("== HECHO ==", apkSigned);
}

main().catch((err) => {
    console.error("ERROR:", err);
    process.exit(1);
});
