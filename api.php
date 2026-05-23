<?php
// =============================================
// api.php — Telegram Mini App uchun Backend API
// Fayl strukturasi:
//   kino/{ID}/nomi.txt        → Kino nomi
//   kino/{ID}/rasm.txt        → Telegram photo file_id
//   kino/{ID}/parts/{N}/film.txt     → Video file_id
//   kino/{ID}/parts/{N}/nomi.txt     → Qism nomi
//   kino/{ID}/parts/{N}/malumot.txt  → Qism haqida ma'lumot
//   kino/{ID}/parts/{N}/rasm.txt     → Qism rasmi
//   kino/{ID}/parts/{N}/downcount.txt→ Ko'rishlar soni
// =============================================

define('BOT_TOKEN', '8917415328:AAG66BIaM9l8DBrYK-58m9jFpi7rT9QRM_g');
define('KINO_DIR', 'kino/');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Telegram-Init-Data');

// OPTIONS preflight so'roviga javob
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// =============================================
// Telegram WebApp initData tekshiruvi (xavfsizlik)
// =============================================
function verifyTelegramInitData($initData) {
    $data = [];
    parse_str($initData, $data);

    if (empty($data['hash'])) return false;

    $hash = $data['hash'];
    unset($data['hash']);

    ksort($data);
    $dataCheckString = implode("\n", array_map(fn($k, $v) => "$k=$v", array_keys($data), array_values($data)));

    $secretKey = hash_hmac('sha256', BOT_TOKEN, 'WebAppData', true);
    $computedHash = hash_hmac('sha256', $dataCheckString, $secretKey);

    return hash_equals($computedHash, $hash);
}

// =============================================
// Telegram photo file_id dan URL olish
// =============================================
function getPhotoUrl($file_id) {
    if (empty($file_id)) return null;

    $url = "https://api.telegram.org/bot" . BOT_TOKEN . "/getFile?file_id=" . urlencode(trim($file_id));
    $response = @file_get_contents($url);
    if (!$response) return null;

    $data = json_decode($response, true);
    if (!$data['ok'] || empty($data['result']['file_path'])) return null;

    return "https://api.telegram.org/file/bot" . BOT_TOKEN . "/" . $data['result']['file_path'];
}

// =============================================
// Fayl tarkibini xavfsiz o'qish
// =============================================
function safeRead($path) {
    if (file_exists($path)) {
        return trim(file_get_contents($path));
    }
    return null;
}

// =============================================
// Yo'riqnoma (route) aniqlash
// =============================================
$action = $_GET['action'] ?? 'list';

switch ($action) {

    // ------------------------------------------
    // 1. Barcha kinolar ro'yxati
    // GET /api.php?action=list
    // ------------------------------------------
    case 'list':
        if (!is_dir(KINO_DIR)) {
            echo json_encode(['ok' => false, 'error' => 'Kinolar papkasi topilmadi']);
            exit();
        }

        $kinolar = [];
        $dirs = scandir(KINO_DIR);

        foreach ($dirs as $kino_id) {
            if ($kino_id === '.' || $kino_id === '..') continue;
            $kino_path = KINO_DIR . $kino_id;
            if (!is_dir($kino_path)) continue;

            $nomi = safeRead("$kino_path/nomi.txt");
            $rasm_file_id = safeRead("$kino_path/rasm.txt");

            // Parts sonini hisoblash
            $parts_dir = "$kino_path/parts";
            $parts_count = 0;
            if (is_dir($parts_dir)) {
                $parts = scandir($parts_dir);
                foreach ($parts as $p) {
                    if ($p !== '.' && $p !== '..' && is_dir("$parts_dir/$p")) {
                        $parts_count++;
                    }
                }
            }

            if (!$nomi) continue; // nomi.txt yo'q bo'lsa o'tkazib yubor

            $kinolar[] = [
                'kino_id'      => $kino_id,
                'kino_nomi'    => $nomi,
                'rasm_file_id' => $rasm_file_id,
                'rasm_url'     => $rasm_file_id ? getPhotoUrl($rasm_file_id) : null,
                'qismlar_soni' => $parts_count,
            ];
        }

        // Eng yangi (katta ID) dan kichikka saralash
        usort($kinolar, fn($a, $b) => (int)$b['kino_id'] - (int)$a['kino_id']);

        echo json_encode([
            'ok'      => true,
            'kinolar' => $kinolar,
            'jami'    => count($kinolar),
        ], JSON_UNESCAPED_UNICODE);
        break;

    // ------------------------------------------
    // 2. Bitta kino va uning barcha qismlari
    // GET /api.php?action=kino&id=123
    // ------------------------------------------
    case 'kino':
        $kino_id = $_GET['id'] ?? '';
        if (!$kino_id || !preg_match('/^\d+$/', $kino_id)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Noto\'g\'ri kino ID']);
            exit();
        }

        $kino_path = KINO_DIR . $kino_id;
        if (!is_dir($kino_path)) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Kino topilmadi']);
            exit();
        }

        $nomi = safeRead("$kino_path/nomi.txt");
        $rasm_file_id = safeRead("$kino_path/rasm.txt");

        // Qismlarni yig'ish
        $qismlar = [];
        $parts_dir = "$kino_path/parts";

        if (is_dir($parts_dir)) {
            $parts = scandir($parts_dir);
            foreach ($parts as $p) {
                if ($p === '.' || $p === '..') continue;
                $part_path = "$parts_dir/$p";
                if (!is_dir($part_path)) continue;

                $qism_nomi    = safeRead("$part_path/nomi.txt");
                $film_file_id = safeRead("$part_path/film.txt");
                $qism_rasm_id = safeRead("$part_path/rasm.txt");
                $malumot      = safeRead("$part_path/malumot.txt");
                $downcount    = (int)(safeRead("$part_path/downcount.txt") ?? 0);

                $qismlar[(int)$p] = [
                    'qism_raqami'  => (int)$p,
                    'qism_nomi'    => $qism_nomi ?? "$nomi — {$p}-qism",
                    'film_file_id' => $film_file_id,
                    'rasm_file_id' => $qism_rasm_id,
                    'rasm_url'     => $qism_rasm_id ? getPhotoUrl($qism_rasm_id) : null,
                    'malumot'      => $malumot,
                    'ko_rishlar'   => $downcount,
                ];
            }
            ksort($qismlar); // raqam bo'yicha saralash
            $qismlar = array_values($qismlar);
        }

        echo json_encode([
            'ok'           => true,
            'kino_id'      => $kino_id,
            'kino_nomi'    => $nomi,
            'rasm_file_id' => $rasm_file_id,
            'rasm_url'     => $rasm_file_id ? getPhotoUrl($rasm_file_id) : null,
            'qismlar_soni' => count($qismlar),
            'qismlar'      => $qismlar,
        ], JSON_UNESCAPED_UNICODE);
        break;

    // ------------------------------------------
    // 3. Qismni tomosha qilish (bot orqali yuborish)
    // POST /api.php?action=watch
    // Body: { kino_id, qism_raqami, tg_user_id }
    // ------------------------------------------
    case 'watch':
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $kino_id     = preg_replace('/\D/', '', $body['kino_id'] ?? '');
        $qism_raqami = (int)($body['qism_raqami'] ?? 1);
        $tg_user_id  = (int)($body['tg_user_id'] ?? 0);

        if (!$kino_id || !$tg_user_id) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Parametrlar noto\'g\'ri']);
            exit();
        }

        $part_path = KINO_DIR . "$kino_id/parts/$qism_raqami";
        if (!is_dir($part_path)) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Qism topilmadi']);
            exit();
        }

        $film_file_id = safeRead("$part_path/film.txt");
        $rasm_file_id = safeRead("$part_path/rasm.txt");
        $malumot      = safeRead("$part_path/malumot.txt") ?? '';
        $kino_nomi    = safeRead(KINO_DIR . "$kino_id/nomi.txt");
        $qism_nomi    = safeRead("$part_path/nomi.txt") ?? "$kino_nomi — $qism_raqami-qism";

        if (!$film_file_id) {
            echo json_encode(['ok' => false, 'error' => 'Video fayl topilmadi']);
            exit();
        }

        // Ko'rishlar sonini oshirish
        $downcount_file = "$part_path/downcount.txt";
        $current = (int)(safeRead($downcount_file) ?? 0);
        file_put_contents($downcount_file, $current + 1);

        // Bot orqali videoni yuborish
        $caption = "<b>🎬 $qism_nomi</b>\n\n";
        if ($malumot) {
            $caption .= "<blockquote>$malumot</blockquote>\n\n";
        }
        $caption .= "📁 Mini App orqali yuborildi";

        $send_data = [
            'chat_id'   => $tg_user_id,
            'video'     => $film_file_id,
            'caption'   => $caption,
            'parse_mode'=> 'html',
        ];

        if ($rasm_file_id) {
            $send_data['thumb'] = $rasm_file_id;
        }

        $ch = curl_init("https://api.telegram.org/bot" . BOT_TOKEN . "/sendVideo");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $send_data);
        $result = curl_exec($ch);
        curl_close($ch);

        $tg_response = json_decode($result, true);

        if ($tg_response['ok'] ?? false) {
            echo json_encode([
                'ok'      => true,
                'message' => 'Video botdan yuborildi! Telegram\'ni oching.',
            ], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode([
                'ok'    => false,
                'error' => 'Video yuborishda xato: ' . ($tg_response['description'] ?? 'Noma\'lum xato'),
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    // ------------------------------------------
    // 4. Qidiruv
    // GET /api.php?action=search&q=avengers
    // ------------------------------------------
    case 'search':
        $query = mb_strtolower(trim($_GET['q'] ?? ''));
        if (strlen($query) < 2) {
            echo json_encode(['ok' => false, 'error' => 'Qidiruv so\'zi kamida 2 harf bo\'lishi kerak']);
            exit();
        }

        $kinolar = [];
        if (is_dir(KINO_DIR)) {
            $dirs = scandir(KINO_DIR);
            foreach ($dirs as $kino_id) {
                if ($kino_id === '.' || $kino_id === '..') continue;
                $kino_path = KINO_DIR . $kino_id;
                if (!is_dir($kino_path)) continue;

                $nomi = safeRead("$kino_path/nomi.txt");
                if (!$nomi) continue;

                if (mb_strpos(mb_strtolower($nomi), $query) !== false) {
                    $rasm_file_id = safeRead("$kino_path/rasm.txt");

                    $parts_count = 0;
                    $parts_dir = "$kino_path/parts";
                    if (is_dir($parts_dir)) {
                        foreach (scandir($parts_dir) as $p) {
                            if ($p !== '.' && $p !== '..' && is_dir("$parts_dir/$p")) $parts_count++;
                        }
                    }

                    $kinolar[] = [
                        'kino_id'      => $kino_id,
                        'kino_nomi'    => $nomi,
                        'rasm_file_id' => $rasm_file_id,
                        'rasm_url'     => $rasm_file_id ? getPhotoUrl($rasm_file_id) : null,
                        'qismlar_soni' => $parts_count,
                    ];
                }
            }
        }

        echo json_encode([
            'ok'      => true,
            'kinolar' => $kinolar,
            'jami'    => count($kinolar),
        ], JSON_UNESCAPED_UNICODE);
        break;

    default:
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Noma\'lum action']);
        break;
}
