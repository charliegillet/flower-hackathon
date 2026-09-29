import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'bank'], required: true },

    // Customer financial profile, in sections — used to prefill applications.
    profile: {
      personal: {
        phone: String,
        dateOfBirth: String,
        address: {
          street: String,
          city: String,
          state: String,
          zip: String,
        },
      },
      income: {
        annualIncome: Number,
        employmentStatus: {
          type: String,
          enum: ['employed', 'self-employed', 'unemployed', 'retired', 'student'],
        },
        employer: String,
        yearsEmployed: Number,
      },
      assets: {
        checking: Number,
        savings: Number,
        investments: Number,
        realEstate: Number,
        other: Number,
      },
      debts: {
        monthlyHousing: Number,
        autoLoans: Number,
        studentLoans: Number,
        creditCards: Number,
        other: Number,
      },
      credit: {
        score: { type: Number, min: 300, max: 850 },
      },
    },

    // Bank-side info.
    bankName: String,

    settings: {
      emailNotifications: { type: Boolean, default: true },
      currency: { type: String, default: 'USD' },
    },
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function () {
  const { passwordHash: _pw, ...rest } = this.toObject();
  return rest;
};

// Convenience: totals derived from the debts/assets sections.
userSchema.methods.monthlyDebtTotal = function () {
  const d = this.profile?.debts || {};
  return ['monthlyHousing', 'autoLoans', 'studentLoans', 'creditCards', 'other'].reduce(
    (sum, k) => sum + (d[k] || 0),
    0,
  );
};

userSchema.methods.totalAssets = function () {
  const a = this.profile?.assets || {};
  return ['checking', 'savings', 'investments', 'realEstate', 'other'].reduce(
    (sum, k) => sum + (a[k] || 0),
    0,
  );
};

export const User = mongoose.model('User', userSchema);
