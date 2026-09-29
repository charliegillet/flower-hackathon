import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'bank'], required: true },
    // Customer financial profile — used to prefill loan applications.
    profile: {
      annualIncome: Number,
      employmentStatus: {
        type: String,
        enum: ['employed', 'self-employed', 'unemployed', 'retired', 'student'],
      },
      monthlyDebt: Number,
      creditScore: { type: Number, min: 300, max: 850 },
    },
    // Bank-side info.
    bankName: String,
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function () {
  const { passwordHash: _pw, ...rest } = this.toObject();
  return rest;
};

export const User = mongoose.model('User', userSchema);
