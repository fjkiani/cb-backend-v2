import mongoose from 'mongoose';

const newsClassificationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  threshold: {
    type: Number,
    required: true
  },
  importance: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const NewsClassification = mongoose.model('NewsClassification', newsClassificationSchema);

export { NewsClassification }; 