import mongoose from 'mongoose';

const configSchema = new mongoose.Schema({
  chave: {
    type: String,
    required: true,
    unique: true
  },
  valor: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  descricao: {
    type: String,
    default: ''
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  dataAtualizacao: {
    type: Date,
    default: Date.now
  }
});

configSchema.pre('save', function(next) {
  this.dataAtualizacao = Date.now();
  next();
});

configSchema.pre('findOneAndUpdate', function() {
  this.set({ dataAtualizacao: Date.now() });
});

const Config = mongoose.model('Config', configSchema);

export default Config;