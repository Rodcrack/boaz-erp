<?php
// Recibe el formulario "Cotizar ahora" de boaz.com.pe:
//  1) guarda la solicitud en Supabase (se ve en el ERP > Cotizaciones)
//  2) envía un correo a contacto@boaz.com.pe
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

const CORREO_DESTINO = 'contacto@boaz.com.pe';
const CORREO_ORIGEN  = 'no-reply@boaz.com.pe';   // debe ser un correo del mismo dominio
const SUPABASE_URL   = 'https://jeftkwjdqzkpswvaqspi.supabase.co';
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZnRrd2pkcXprcHN3dmFxc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI0OTEsImV4cCI6MjEwMDQwODQ5MX0.Ta8Ei_wCm8ZEzD3IM-S60R0rJvI_d5BTvix_Z3W4EmY';

function salir($ok, $extra = [], $code = 200) {
  http_response_code($code);
  echo json_encode(array_merge(['ok' => $ok], $extra));
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') salir(false, ['error' => 'metodo'], 405);

$raw = file_get_contents('php://input');
if (strlen($raw) > 10000) salir(false, ['error' => 'grande'], 413);
$d = json_decode($raw, true);
if (!is_array($d)) salir(false, ['error' => 'datos'], 400);

// Anti-spam: campo trampa y límite por IP (5 por hora)
if (!empty($d['web'])) salir(true);
$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'x';
$f = sys_get_temp_dir() . '/boaz_cot_' . md5($ip);
$marcas = is_file($f) ? array_filter(array_map('intval', explode(',', (string)file_get_contents($f))), fn($t) => $t > time() - 3600) : [];
if (count($marcas) >= 5) salir(false, ['error' => 'limite'], 429);
$marcas[] = time();
@file_put_contents($f, implode(',', $marcas));

function limpio($v, $max) {
  $v = trim(strip_tags((string)$v));
  $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $v);
  return mb_substr($v, 0, $max);
}
$c = [
  'nombre'   => limpio($d['nombre']   ?? '', 150),
  'empresa'  => limpio($d['empresa']  ?? '', 150),
  'email'    => limpio($d['email']    ?? '', 150),
  'whatsapp' => limpio($d['whatsapp'] ?? '', 30),
  'servicio' => limpio($d['servicio'] ?? '', 100),
  'volumen'  => limpio($d['volumen']  ?? '', 100),
  'mensaje'  => limpio($d['mensaje']  ?? '', 3000),
  'estado'   => 'nueva',
  'origen'   => 'web',
];
if (mb_strlen($c['nombre']) < 2 || !filter_var($c['email'], FILTER_VALIDATE_EMAIL) || strlen($c['whatsapp']) < 7) {
  salir(false, ['error' => 'validacion'], 422);
}

// 1) Guardar en Supabase
$guardado = false;
$ch = curl_init(SUPABASE_URL . '/rest/v1/cotizaciones');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => json_encode($c, JSON_UNESCAPED_UNICODE),
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'apikey: ' . SUPABASE_ANON,
    'Authorization: Bearer ' . SUPABASE_ANON,
    'Prefer: return=minimal',
  ],
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 10,
]);
curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$guardado = ($http >= 200 && $http < 300);

// 2) Enviar correo
$asunto = '=?UTF-8?B?' . base64_encode('Nueva cotización web: ' . $c['nombre'] . ' (' . $c['empresa'] . ')') . '?=';
$cuerpo = "Nueva solicitud de cotización desde boaz.com.pe\n\n"
  . "Nombre:   {$c['nombre']}\nEmpresa:  {$c['empresa']}\nEmail:    {$c['email']}\nWhatsApp: {$c['whatsapp']}\n"
  . "Servicio: {$c['servicio']}\nVolumen:  {$c['volumen']}\n\nMensaje:\n{$c['mensaje']}\n\n"
  . "WhatsApp directo: https://wa.me/" . (strlen(preg_replace('/\D/', '', $c['whatsapp'])) === 9 ? '51' : '') . preg_replace('/\D/', '', $c['whatsapp']) . "\n"
  . "Ver en el ERP: https://boaz-erp.netlify.app/ > Cotizaciones\n";
$cab = "From: Boaz Web <" . CORREO_ORIGEN . ">\r\n"
  . "Reply-To: " . $c['email'] . "\r\n"
  . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
$enviado = @mail(CORREO_DESTINO, $asunto, $cuerpo, $cab, '-f' . CORREO_ORIGEN);

if (!$guardado && !$enviado) salir(false, ['error' => 'servidor'], 502);
salir(true, ['guardado' => $guardado, 'correo' => $enviado]);
