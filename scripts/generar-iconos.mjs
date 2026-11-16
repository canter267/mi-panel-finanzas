// Genera los íconos PNG de la PWA sin depender de ninguna librería.
// Uso: node scripts/generar-iconos.mjs   (solo hace falta si querés cambiar el ícono)
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const VERDE = [5, 150, 105]
const BLANCO = [255, 255, 255]

// Tres barras que suben, en coordenadas de 0 a 1: [x, ancho, alto], apoyadas en y = 0.72.
const BARRAS = [
  [0.28, 0.11, 0.18],
  [0.445, 0.11, 0.3],
  [0.61, 0.11, 0.44],
]
const BASE = 0.72

function dibujar(lado, { redondeado }) {
  const px = Buffer.alloc(lado * lado * 4)
  const r = redondeado ? lado * 0.22 : 0
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      // Esquinas redondeadas: afuera del radio queda transparente.
      const dx = Math.max(r - x, x - (lado - 1 - r), 0)
      const dy = Math.max(r - y, y - (lado - 1 - r), 0)
      const adentro = dx * dx + dy * dy <= r * r
      const u = (x + 0.5) / lado
      const v = (y + 0.5) / lado
      const enBarra = BARRAS.some(([bx, ancho, alto]) => u >= bx && u < bx + ancho && v >= BASE - alto && v < BASE)
      const [cr, cg, cb] = enBarra ? BLANCO : VERDE
      const i = (y * lado + x) * 4
      px[i] = cr
      px[i + 1] = cg
      px[i + 2] = cb
      px[i + 3] = adentro ? 255 : 0
    }
  }
  return px
}

function trozo(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo) >>> 0)
  return Buffer.concat([largo, cuerpo, crc])
}

function png(lado, px) {
  const cabecera = Buffer.alloc(13)
  cabecera.writeUInt32BE(lado, 0)
  cabecera.writeUInt32BE(lado, 4)
  cabecera.set([8, 6, 0, 0, 0], 8) // 8 bits, RGBA
  const filas = Buffer.alloc((lado * 4 + 1) * lado)
  for (let y = 0; y < lado; y++) {
    px.copy(filas, y * (lado * 4 + 1) + 1, y * lado * 4, (y + 1) * lado * 4) // byte 0 de cada fila = sin filtro
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
const archivos = [
  ['pwa-192.png', 192, true],
  ['pwa-512.png', 512, true],
  ['pwa-maskable-512.png', 512, false], // el sistema lo recorta con su propia forma
  ['apple-touch-icon.png', 180, false], // iOS redondea solo
]
for (const [nombre, lado, redondeado] of archivos) {
  writeFileSync(`public/${nombre}`, png(lado, dibujar(lado, { redondeado })))
  console.log(`public/${nombre} (${lado}x${lado})`)
}
