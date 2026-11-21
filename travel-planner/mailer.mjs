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

// 가입 이메일 확인 코드 (6자리, 10분) · 이미 가입한 이메일이면 코드 대신 "이미 가입돼 있어요" 안내 (가입 여부를 화면으로는 알 수 없게)
const CODE = {
  ko: { subject: "[보폭] 이메일 확인 코드", hi: "보폭 이메일 확인 코드예요. 10분 안에 앱에 입력하세요.", note: "직접 요청하지 않았다면 이 메일을 무시하세요. 이 코드를 누구에게도 알려 주지 마세요.", already: "이 이메일은 이미 보폭에 가입돼 있어요. 로그인하거나, 비밀번호가 생각나지 않으면 '비밀번호를 잊었어요'를 쓰세요.", alreadySubject: "[보폭] 이미 가입된 이메일이에요" },
  en: { subject: "[Bopok] Email verification code", hi: "Here is your Bopok email verification code. Enter it in the app within 10 minutes.", note: "If you didn't ask for this, ignore this email. Never share this code.", already: "This email already has a Bopok account. Log in, or use 'Forgot password' if you can't remember it.", alreadySubject: "[Bopok] This email already has an account" },
  ja: { subject: "[ボポク] メール確認コード", hi: "ボポクのメール確認コードです。10分以内にアプリに入力してください。", note: "心当たりがない場合はこのメールを無視してください。このコードは誰にも教えないでください。", already: "このメールはすでにボポクに登録されています。ログインするか、思い出せない場合は「パスワードを忘れました」を使ってください。", alreadySubject: "[ボポク] すでに登録済みのメールです" },
  zh: { subject: "[步幅] 邮箱验证码", hi: "这是你的步幅邮箱验证码，请在10分钟内输入应用。", note: "如果不是你本人申请，请忽略此邮件。不要把验证码告诉任何人。", already: "该邮箱已注册步幅。请直接登录，如忘记密码请使用“忘记密码”。", alreadySubject: "[步幅] 该邮箱已注册" },
};
export function codeMail(lang, code) {
  const m = CODE[lang] || CODE.ko;
  return { subject: m.subject, text: `${m.hi}\n\n${code}\n\n${m.note}\n`, html: `<div style="font-family:sans-serif;line-height:1.6;max-width:520px"><p>${m.hi}</p><p style="font:800 32px/1.2 monospace;letter-spacing:.25em;padding:14px 18px;background:#eaedf9;border-radius:12px;display:inline-block">${code}</p><p style="font-size:13px;color:#555">${m.note}</p></div>` };
}
export function alreadyMail(lang) {
  const m = CODE[lang] || CODE.ko;
  return { subject: m.alreadySubject, text: `${m.already}\n\n${m.note}\n`, html: `<div style="font-family:sans-serif;line-height:1.6;max-width:520px"><p>${m.already}</p></div>` };
}
