// 메일 보내기 (비밀번호 재설정 링크): SMTP. 설정이 없으면 null을 돌려주고, 화면에서 '메일로 받기'를 숨긴다.
// 설정(환경변수): SMTP_URL (예: smtps://아이디:앱비밀번호@smtp.naver.com:465) 또는 SMTP_HOST·SMTP_PORT·SMTP_USER·SMTP_PASS
//               MAIL_FROM (예: "보폭 <no-reply@example.com>", 보내는 계정과 같은 주소여야 하는 곳이 많다)
// 네이버·다음·Gmail(앱 비밀번호)·Amazon SES·Resend SMTP 등 어떤 SMTP든 된다. 메일 내용·주소는 로그에 남기지 않는다.
import nodemailer from "nodemailer";

export function createMailer(env = process.env) {
  const from = env.MAIL_FROM;
  if (!from || !(env.SMTP_URL || env.SMTP_HOST)) return null;
  const transport = env.SMTP_URL
    ? nodemailer.createTransport(env.SMTP_URL)
    : nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), secure: Number(env.SMTP_PORT || 465) === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
  return {
    async send({ to, subject, text, html }) {
      await transport.sendMail({ from, to, subject, text, html });
    },
  };
}

// 비밀번호 재설정 메일 (4개 언어). link는 PUBLIC_APP_URL로 만든 주소만 넣는다 (요청의 Host 머리글은 믿지 않음)
const RESET = {
  ko: { subject: "[보폭] 비밀번호 다시 정하기", hi: "보폭 비밀번호를 다시 정하려면 아래 링크를 30분 안에 여세요.", note: "직접 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않습니다.", warn: "메일로 다시 정하면 서버에 암호화해 둔 일정은 지워지고, 그 기기에 저장된 일정으로 다시 채워집니다. 복구 코드가 있으면 앱의 '복구 코드로'를 쓰면 서버 일정이 그대로 남습니다.", btn: "비밀번호 다시 정하기" },
  en: { subject: "[Bopok] Reset your password", hi: "Open the link below within 30 minutes to reset your Bopok password.", note: "If you didn't ask for this, ignore this email. Your password won't change.", warn: "Resetting by email clears the encrypted plans on the server; they are refilled from the plans saved on that device. If you have your recovery code, use 'With recovery code' in the app to keep them.", btn: "Reset password" },
  ja: { subject: "[ボポク] パスワードの再設定", hi: "ボポクのパスワードを再設定するには、30分以内に下のリンクを開いてください。", note: "心当たりがない場合はこのメールを無視してください。パスワードは変わりません。", warn: "メールで再設定すると、サーバーに暗号化して保存した日程は消え、その端末に保存された日程で埋め直されます。復旧コードがあればアプリの「復旧コードで」を使うとそのまま残ります。", btn: "パスワードを再設定" },
  zh: { subject: "[步幅] 重设密码", hi: "请在30分钟内打开下面的链接，重设步幅密码。", note: "如果不是你本人申请，请忽略此邮件，密码不会改变。", warn: "通过邮件重设后，服务器上加密保存的行程会被清除，并用该设备上保存的行程重新填充。如有恢复码，请在应用中使用“用恢复码”以保留行程。", btn: "重设密码" },
};
export function resetMail(lang, link) {
  const m = RESET[lang] || RESET.ko;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return {
    subject: m.subject,
    text: `${m.hi}\n\n${link}\n\n${m.warn}\n\n${m.note}\n`,
    html: `<div style="font-family:sans-serif;line-height:1.6;max-width:520px"><p>${esc(m.hi)}</p><p><a href="${esc(link)}" style="display:inline-block;padding:12px 18px;background:#34479a;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">${esc(m.btn)}</a></p><p style="font-size:13px;color:#555">${esc(m.warn)}</p><p style="font-size:13px;color:#555">${esc(m.note)}</p></div>`,
  };
}
