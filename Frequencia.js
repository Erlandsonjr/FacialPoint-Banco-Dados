import mongoose from 'mongoose';

const frequenciaSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true
  },
  usuario_id: {
    type: String,
    required: true
  },
  data: {
    type: Date,
    required: true
  },
  tipo_registro: {
    type: String,
    enum: ['entrada', 'saida'],
    default: 'entrada'
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

const Frequencia = mongoose.model('Frequencia', frequenciaSchema);

export default Frequencia;
