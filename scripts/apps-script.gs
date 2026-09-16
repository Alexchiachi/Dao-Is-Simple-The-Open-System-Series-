/**
 * 大道至簡 — 審核申請表單接收端
 *
 * 安裝步驟（約五分鐘，全部在你自己的 Google 帳號內完成）：
 *
 *  1. 建立一份新的 Google 試算表，命名隨意。
 *  2. 在試算表中選 擴充功能 → Apps Script。
 *  3. 刪掉編輯器裡的預設內容，把這個檔案全部貼進去。
 *  4. 若要在有人申請時收到通知，把下方 NOTIFY_EMAIL 填成你的信箱。
 *  5. 右上角 部署 → 新增部署作業 → 類型選「網頁應用程式」。
 *       - 執行身分：我
 *       - 誰可以存取：**所有人**（必須是這個，網頁才能送出資料）
 *  6. 按「部署」，第一次會要求授權，同意即可。
 *  7. 想先確認一切正常：在函式選單選 sendTestApplication，按「執行」。
 *     試算表應出現一列測試資料，信箱應收到一封通知信。
 *  8. 複製產生的「網頁應用程式網址」，形如：
 *       https://script.google.com/macros/s/AKfycb....../exec
 *     把這串網址交回，我填進網頁裡。
 *
 * 之後每次修改這個檔案，都要重新「部署 → 管理部署作業 → 編輯 → 版本：新版本」，
 * 否則線上跑的還是舊版。網址不會變。
 */

const SHEET_NAME = '申請紀錄';
const NOTIFY_EMAIL = 'jianchiachi@gmail.com';   // 每次申請寄出通知；留空則不寄

const HEADERS = ['送出時間', '申請層級', '姓名', 'Email', '職位與年收級距', '系統性瓶頸', '索取策略指南'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 蜜罐欄位：真人看不到也不會填，填了就是機器人。靜默丟棄，不回報失敗。
    if (data.website) {
      return json({ ok: true });
    }

    const row = [
      new Date(),
      data.level || '',
      data.name || '',
      data.email || '',
      data.tier || '',
      data.bottleneck || '',
      data.guide ? '是' : '否'
    ];
    sheet().appendRow(row);

    if (NOTIFY_EMAIL) {
      notify(data);
    }
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

// 用瀏覽器直接開啟部署網址時，用來確認部署是否成功
function doGet() {
  return json({ ok: true, message: '審核申請接收端運作中' });
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (s.getLastRow() === 0) {
    s.appendRow(HEADERS);
    s.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    s.setFrozenRows(1);
    s.setColumnWidth(6, 420);   // 瓶頸欄位通常最長
  }
  return s;
}

function notify(data) {
  if (!data) {
    throw new Error(
      'notify() 是由 doPost 自動呼叫的，不要在編輯器直接執行它。' +
      '要寄一封測試信，請在函式選單改選 sendTestApplication 再按執行。'
    );
  }
  const level = data.level || '未指定層級';
  const name = data.name || '未具名';
  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const when = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm');

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    name: '大道至簡',
    replyTo: data.email || NOTIFY_EMAIL,   // 直接按回覆就是回給申請人
    subject: '【大道至簡】新申請：' + name + '｜' + level.split('・')[0],
    body: plainBody(data, when, sheetUrl),
    htmlBody: htmlBody(data, when, sheetUrl)
  });
}

// 純文字備援，給不顯示 HTML 的收件軟體
function plainBody(data, when, sheetUrl) {
  return [
    '新的審核申請',
    '',
    '申請層級：' + (data.level || ''),
    '姓名：' + (data.name || ''),
    'Email：' + (data.email || ''),
    '職位與年收級距：' + (data.tier || ''),
    '索取策略指南：' + (data.guide ? '是' : '否'),
    '送出時間：' + when,
    '',
    '目前最大的系統性瓶頸：',
    data.bottleneck || '（未填）',
    '',
    '試算表：' + sheetUrl
  ].join('\n');
}

/**
 * 信件版面刻意與網站同一套語言：宋體標題、赤陶主色、髮絲線分隔。
 * 全部使用表格與行內樣式——郵件軟體對 flexbox、grid 與外部樣式表的支援不可靠。
 */
function htmlBody(data, when, sheetUrl) {
  const SERIF = "Georgia,'Songti TC','Songti SC','Times New Roman',serif";
  const SANS = "-apple-system,'Segoe UI','PingFang TC','Microsoft JhengHei',Arial,sans-serif";
  const INK = '#1C1F22', MUTED = '#6E6A66', FAINT = '#96918B';
  const LINE = '#E4DFD8', ACCENT = '#8D5B4C', MOSS = '#2C3E35';

  const label = 'font-family:' + SANS + ';font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:' + FAINT + ';margin:0;';
  const value = 'font-family:' + SANS + ';font-size:15px;line-height:1.6;color:' + INK + ';margin:4px 0 0;';

  const rows = [
    ['姓名', esc(data.name)],
    ['Email', data.email ? '<a href="mailto:' + esc(data.email) + '" style="color:' + ACCENT + ';text-decoration:none;">' + esc(data.email) + '</a>' : '—'],
    ['職位與年收級距', esc(data.tier)],
    ['索取策略指南', data.guide ? '是' : '否'],
    ['送出時間', when]
  ].map(function (r) {
    return '<tr><td style="padding:0 0 18px;">' +
      '<p style="' + label + '">' + r[0] + '</p>' +
      '<p style="' + value + '">' + (r[1] || '—') + '</p>' +
      '</td></tr>';
  }).join('');

  const bottleneck = data.bottleneck
    ? esc(data.bottleneck).replace(/\n/g, '<br>')
    : '（未填）';

  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F0EC;padding:30px 12px;margin:0;">',
    '<tr><td align="center">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ' + LINE + ';border-radius:10px;">',

    // 標頭：層級是這封信最重要的一件事
    '<tr><td style="padding:34px 34px 0;">',
    '<p style="font-family:' + SANS + ';font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:' + FAINT + ';margin:0 0 14px;">大道至簡 · 審核申請</p>',
    '<p style="font-family:' + SERIF + ';font-size:21px;line-height:1.45;color:' + INK + ';margin:0;">' + esc(data.level) + '</p>',
    '</td></tr>',

    '<tr><td style="padding:26px 34px 0;"><div style="height:1px;background:' + LINE + ';font-size:0;line-height:0;">&nbsp;</div></td></tr>',

    // 欄位
    '<tr><td style="padding:26px 34px 0;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table>',
    '</td></tr>',

    // 瓶頸：這段最長也最重要，給它自己的區塊
    '<tr><td style="padding:8px 34px 0;">',
    '<p style="' + label + 'margin-bottom:10px;">目前最大的系統性瓶頸</p>',
    '<div style="font-family:' + SERIF + ';font-size:15px;line-height:1.85;color:' + INK + ';border-left:2px solid ' + LINE + ';padding:2px 0 2px 16px;">' + bottleneck + '</div>',
    '</td></tr>',

    // 動作
    '<tr><td style="padding:30px 34px 0;">',
    '<a href="mailto:' + esc(data.email) + '" style="display:inline-block;background:' + ACCENT + ';color:#FFFFFF;font-family:' + SANS + ';font-size:15px;font-weight:500;text-decoration:none;padding:13px 26px;border-radius:980px;">回覆 ' + esc(data.name || '申請人') + '</a>',
    '</td></tr>',
    '<tr><td style="padding:18px 34px 34px;">',
    '<a href="' + sheetUrl + '" style="font-family:' + SANS + ';font-size:14px;color:' + ACCENT + ';text-decoration:none;">在試算表中檢視全部申請 &rsaquo;</a>',
    '</td></tr>',

    '</table>',
    '<p style="font-family:' + SANS + ';font-size:11px;color:' + FAINT + ';margin:18px 0 0;">本信由網站的審核申請表單自動寄出。</p>',
    '</td></tr></table>'
  ].join('');
}

// 申請人填的內容會進到 HTML 裡，一律轉義，避免內容破壞版面或夾帶標記
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 在編輯器的函式選單選這一個，按「執行」，會送出一筆完整的測試申請：
 * 試算表寫入一列，並寄出一封通知信到 NOTIFY_EMAIL。
 * 用來確認授權、試算表與信箱三件事都正常。測試資料可直接從試算表刪掉。
 */
function sendTestApplication() {
  const result = doPost({
    postData: {
      contents: JSON.stringify({
        level: '第一階・90 分鐘生命場域深度對話（NT$ 26,400）',
        name: '測試申請',
        email: NOTIFY_EMAIL || 'test@example.com',
        tier: '創辦人 / 負責人・年收 300–1,000 萬',
        bottleneck: '這是一筆測試資料，確認無誤後可直接從試算表刪除。\n第二行用來確認換行有正確顯示。',
        guide: true
      })
    }
  });
  console.log('回應：' + result.getContent());
  console.log(NOTIFY_EMAIL ? '通知信已寄往 ' + NOTIFY_EMAIL : 'NOTIFY_EMAIL 尚未填寫，因此沒有寄信');
}

// ContentService 的 JSON 回應——doPost 與 doGet 都靠它回話
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
