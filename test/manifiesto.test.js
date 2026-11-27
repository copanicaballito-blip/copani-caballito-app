import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Comprueba que la app se pueda instalar en el celular con su ícono: que el manifiesto tenga lo que exigen
// Chrome (https://web.dev/articles/install-criteria) y que cada ícono exista y mida lo que declara.

const docs = new URL("../docs/", import.meta.url);
const leer = (nombre) => readFileSync(new URL(nombre, docs));
const manifiesto = JSON.parse(leer("manifest.webmanifest").toString("utf8"));

/** [ancho, alto] de un PNG, leído de su encabezado. */
function tamanoPng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "empieza con la firma de un PNG");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

test("manifiesto: tiene lo necesario para instalarse como app", () => {
  assert.ok(manifiesto.name && manifiesto.short_name, "nombre y nombre corto");
  assert.ok(manifiesto.short_name.length <= 12, "el nombre corto entra debajo del ícono");
  assert.equal(manifiesto.start_url, "./");
  assert.equal(manifiesto.display, "standalone"); // sin barra del navegador
  assert.match(manifiesto.background_color, /^#[0-9A-Fa-f]{6}$/);
  assert.match(manifiesto.theme_color, /^#[0-9A-Fa-f]{6}$/);
});

test("manifiesto: cada ícono existe, es PNG y mide lo que declara", () => {
  assert.ok(manifiesto.icons.length >= 4);
  for (const icono of manifiesto.icons) {
    assert.ok(existsSync(new URL(icono.src, docs)), `existe ${icono.src}`);
    const [ancho, alto] = icono.sizes.split("x").map(Number);
    assert.deepEqual(tamanoPng(leer(icono.src)), [ancho, alto], `${icono.src} mide ${icono.sizes}`);
    assert.equal(icono.type, "image/png");
  }
});

test("manifiesto: hay íconos normales Y con margen (maskable) de 192 y 512", () => {
  // Android recorta los íconos "maskable" con distintas formas: por eso tienen margen. Los normales van sin recorte.
  for (const proposito of ["any", "maskable"]) {
    for (const tamano of ["192x192", "512x512"]) {
      assert.ok(manifiesto.icons.some((i) => i.purpose === proposito && i.sizes === tamano), `${proposito} ${tamano}`);
    }
  }
});

test("index.html: apunta al manifiesto, al ícono de iPhone (180x180) y al ícono de la pestaña", () => {
  const html = leer("index.html").toString("utf8");
  const href = (rel) => html.match(new RegExp(`<link[^>]*rel="${rel}"[^>]*href="([^"]+)"`))?.[1];
  assert.equal(href("manifest"), "manifest.webmanifest");
  const iphone = href("apple-touch-icon");
  assert.ok(iphone && existsSync(new URL(iphone, docs)), "existe el ícono de iPhone");
  assert.deepEqual(tamanoPng(leer(iphone)), [180, 180]);
  const pestana = href("icon");
  assert.ok(pestana && existsSync(new URL(pestana, docs)), "existe el ícono de la pestaña");
});
