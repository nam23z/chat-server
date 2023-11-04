const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: true,
  auth: {
    user: "namnguyencong23@gmail.com",
    pass: "dugf gpqm wmwi jcdz",
  },
});

const sendGMail = async ({
  to,
  sender,
  subject,
  html,
  text,
  attachments,
}) => {
  try {
    const from = "namnguyencong23@gmail.com";

    const msg = {
      to: to, // email of recipient
      from: from, // this will be our verified sender
      subject: subject,
      html: html,
      // text: text,
      attachments,
    };
    return await transporter.sendMail(msg)
  } catch (error) {
    console.log(error);
  }
};



exports.sendMail = async (args) => {
  if (process.env.NODE_ENV === "development") {
    return new Promise.resolve();
  } else {
    return sendGMail(args);
  }
};
