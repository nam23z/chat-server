const jwt = require("jsonwebtoken");

const otpGenerator = require("otp-generator");

const crypto = require("crypto");

const mailService = require("../services/mailer");

const filterObj = require("../utils/filterObj");

// Model
const User = require("../models/user");
const otp = require("../Templates/Mail/otp");

const { promisify } = require("util");

const catchAsync = require("../utils/catchAsync");

// this function will return you jwt token
const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

// Register new user

exports.regiser = async (req, res, next)=> {
  const { firstName, lastName, email, password } = req.body;

  const filteredBody = filterObj(req.body, "firstName", "lastName", "email", "password");

  //check if verified user with given email exists

  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    // user with this email already exists, Please login
    res.status(400).json({
      status: "error",
      message: "Email is already in use, Please login.",
    });
  } else if (existing_user) {
    //if not verified than update prev one
    await User.findOneAndUpdate({ email: email }, filteredBody, {
      new: true,
      validateModifiedOnly: true,
    });

    //generate an OTP and send mail to user
    req.userId = existing_user._id;
    next();
  } else {
    // if user is not created before than create a new one

    const new_user = await User.create(filteredBody);

    //generate an OTP and send mail to user
    req.userId = new_user._id;
    next();
  }
};

exports.sendOTP = async (req, res, next) => {
  const { userId } = req;

  const new_otp = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000; //10 mins after otp is sent

  const user = await User.findByIdAndUpdate(userId,{
    otp_expiry_time: otp_expiry_time,
  });

  user.otp = new_otp.toString();

  await user.save({ new: true, validateModifiedOnly: true });
  console.log(new_otp);

  //TODO Send mail
  mailService.sendMail({
    from: "namnguyencong23@gmail.com",
    to: user.email,
    subject: "Verification OTP",
    html: otp(user.firstName, new_otp),
    attachments: [],
  });

  res.status(200).json({
    status: "success",
    message: "OTP Sent Successfully!",
  });
};

exports.verifyOTP = async (req, res, next) => {
  //verify OTP and update user record accordingly

  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP expired",
    });
  }

  if (user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  //otp is correct

  user.verified = true;
  user.otp = undefined;

  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "OTP verified successfully",
    token,
    user_id: user._id,
  });
};

exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: "error",
      message: "Both email and password are required",
    });
  }

  const userDoc = await User.findOne({ email: email }).select("+password");

  if (!userDoc || !userDoc.password) {
    res.status(400).json({
      status: "error",
      message: "Incorrect password",
    });

    return;
  }

  if (
    !userDoc ||
    !(await userDoc.correctPassword(password, userDoc.password))
  ) {
    res.status(400).json({
      status: "error",
      message: "Email or password is incorrect",
    });
  }

  const token = signToken(userDoc._id);

  res.status(200).json({
    status: "success",
    message: "Logged in successfully",
    token,
    user_id: userDoc._id,
  });
};

exports.protect = async (req, res, next) => {
  //1) Getting token (JWT) and check if it's there

  let token;

  //'Bearer nfaklfnklfa124312';

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    req.status(400),
      json({
        status: "error",
        message: "You are not logged in! Please log in to get access",
      });

    return;
  }

  // 2) verification of token

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //3) check if user still exist

  const this_user = await User.findById(decoded.userId);

  if (!this_user) {
    res.status(400).json({
      status: "error",
      message: "The user doesn't exist",
    });
  }

  //4) check if user changed their password after token was issued

  if (this_user.changedPasswordAfter(decoded.iat)) {
    res.status(400).json({
      status: "error",
      message: "User recently updated password! Please log in again",
    });
  }

  //
  req.user = this_user;
  next();
};

// Types of routes -> Protected (Only logged in users can access these) & unProtected

exports.forgotPassword = async (req, res, next) => {
  //1) get user email

  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "There is no user with given email address",
    });
    return;
  }

  //2) generate the random reset token

  const resetToken = user.createPasswordResetToken();

  await user.save({validateBeforeSave: false});

  //3) send it to user's email

  
  try {
    const resetURL = `https://tawk.com/auth/reset-password/?code=${resetToken}`;

    console.log(resetToken);
    //TODO => send mail with reset url
    res.status(200).json({
      status: "success",
      message: "Reset password link sent to your email",
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(500).json({
      status: "error",
      message: "There was an error sending the mail, Please try again later.",
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  //1) get user based on token

  const hashedToken = crypto
    .createHash("sha256")
    .update(req.body.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  //2) if token has expired or user is out of time window

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "Token is invalid or Expired",
    });
    return;
  }

  //3) update users password and set resetToken & expiry to undefined
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  //4) Log in the user and Send new JWT

  //TODO => send an email to user informing about password reset

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "Password Reseted successfully",
    token,
  });
};
