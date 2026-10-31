/**
 * Diagnóstico del firewall de Silogtran (AWS WAF), sin credenciales: pide la
 * página de login sin token, abre Chrome sin interfaz para obtener el token
 * aws-waf y vuelve a pedirla con él. Misma lógica que
 * lib/silogtran/cliente.ts › obtenerCookiesWaf.
 *
 * Uso: npm run probar:waf   (lee WAF_CHROME_PATH y SILOG_BASE_URL de .env / .env.local)
 */
import puppeteer from "puppeteer-core";
const BASE = process.env.SILOG_BASE_URL || "https://construproyec.colombiasoftware.net/";
const LOGIN = new URL("index.php?page=LoginPage", BASE).href;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const sin = await fetch(LOGIN, { headers: { "user-agent": UA }, redirect: "manual" });
console.log("Sin token  → HTTP", sin.status, "· x-amzn-waf-action:", sin.headers.get("x-amzn-waf-action"));

const t0 = Date.now();
const nav = await puppeteer.launch({ headless: true, executablePath: process.env.WAF_CHROME_PATH,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
let cookies = [];
try {
  const pg = await nav.newPage(); await pg.setUserAgent(UA);
  try { await pg.goto(LOGIN, { waitUntil: "domcontentloaded", timeout: 30000 }); } catch {}
  const limite = Date.now() + 30000;
  while (Date.now() < limite) { cookies = await pg.cookies(); if (cookies.some(c => c.name === "aws-waf-token")) break; await new Promise(r => setTimeout(r, 500)); }
} finally { await nav.close(); }
const waf = cookies.filter(c => c.name.toLowerCase().startsWith("aws-waf"));
console.log("Navegador  → token:", waf.map(c => c.name).join(", ") || "NINGUNO", `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);

const con = await fetch(LOGIN, { headers: { "user-agent": UA, cookie: waf.map(c => `${c.name}=${c.value}`).join("; ") }, redirect: "manual" });
const html = await con.text();
console.log("Con token  → HTTP", con.status, "· waf:", con.headers.get("x-amzn-waf-action"), "· formulario de login:", html.includes("ctl0$MainModule$BtnIngresar") ? "SÍ" : "NO");
