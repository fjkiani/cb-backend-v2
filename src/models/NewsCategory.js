import mongoose from 'mongoose';

const newsCategorySchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    unique: true
  },
  keywords: [{
    type: String
  }],
  weight: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const NewsCategory = mongoose.model('NewsCategory', newsCategorySchema);

export { NewsCategory }; 