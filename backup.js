// バックアップ：変更の記録を残して、OneDriveにフォルダごとコピーする
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const dest = path.join(process.env.OneDrive || path.join(process.env.USERPROFILE, 'OneDrive'), 'カレンダーアプリ_バックアップ');
const stamp = new Date().toLocaleString('ja-JP');

try {
  execSync('git add -A', { cwd: here, stdio: 'ignore' });
  const changed = execSync('git status --porcelain', { cwd: here }).toString().trim();
  if (changed) {
    execSync(`git commit -q -m "バックアップ ${stamp}"`, { cwd: here, stdio: 'ignore' });
    console.log('変更の記録を残しました。');
  } else {
    console.log('前回から変更はありません。');
  }
  try {
    execSync('git push -q origin main', { cwd: here, stdio: 'ignore' });
    console.log('GitHubにも保存しました（スマホ用ページも数分で更新されます）。');
  } catch (e) { console.log('GitHubへの保存はできませんでした（インターネット接続を確認してください）。'); }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(here, dest, { recursive: true });
  console.log('バックアップしました： ' + dest);
} catch (e) {
  console.log('バックアップに失敗しました： ' + e.message);
  process.exitCode = 1;
}
