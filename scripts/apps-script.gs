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
 *  7. 複製產生的「網頁應用程式網址」，形如：
 *       https://script.google.com/macros/s/AKfycb....../exec
 *     把這串網址交回，我填進網頁裡。
 *
 * 之後每次修改這個檔案，都要重新「部署 → 管理部署作業 → 編輯 → 版本：新版本」，
 * 否則線上跑的還是舊版。網址不會變。
 */

const SHEET_NAME = '申請紀錄';
const NOTIFY_EMAIL = '';   // 填入信箱即在每次申請時寄出通知；留空則不寄

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
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '【大道至簡】新的審核申請：' + (data.name || '未具名'),
    body: [
      '申請層級：' + (data.level || ''),
      '姓名：' + (data.name || ''),
      'Email：' + (data.email || ''),
      '職位與年收級距：' + (data.tier || ''),
      '',
      '目前最大的系統性瓶頸：',
      data.bottleneck || '',
      '',
      '索取策略指南：' + (data.guide ? '是' : '否'),
      '',
      '試算表：' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].join('\n')
  });
}
