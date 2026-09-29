import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    agent: { type: String, enum: ['client-agent', 'bank-agent', 'system'], required: true },
    text: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } },
);

const evaluationSchema = new mongoose.Schema(
  {
    decision: { type: String, enum: ['approved', 'countered', 'denied'] },
    approvedAmount: Number,
    interestRate: Number,
    termMonths: Number,
    monthlyPayment: Number,
    riskScore: Number,
    reasons: [String],
  },
  { _id: false },
);

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    applicant: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      annualIncome: { type: Number, required: true },
      employmentStatus: {
        type: String,
        enum: ['employed', 'self-employed', 'unemployed', 'retired', 'student'],
        required: true,
      },
      monthlyDebt: { type: Number, default: 0 },
      totalAssets: { type: Number, default: 0 },
      creditScore: { type: Number, min: 300, max: 850 },
    },
    loan: {
      amount: { type: Number, required: true },
      purpose: {
        type: String,
        enum: ['home', 'auto', 'personal', 'business', 'education', 'debt-consolidation', 'other'],
        required: true,
      },
      termMonths: { type: Number, default: 36 },
    },
    status: {
      type: String,
      enum: ['submitted', 'negotiating', 'approved', 'countered', 'denied', 'accepted', 'withdrawn'],
      default: 'submitted',
    },
    evaluation: evaluationSchema,
    // Final human decision by a bank user, after the agents have negotiated.
    bankDecision: {
      decision: { type: String, enum: ['approved', 'denied'] },
      note: String,
      decidedBy: String,
      decidedAt: Date,
    },
    conversation: [messageSchema],
  },
  { timestamps: true },
);

export const Application = mongoose.model('Application', applicationSchema);
