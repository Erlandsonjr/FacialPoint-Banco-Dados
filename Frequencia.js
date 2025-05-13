import mongoose from "mongoose";

const FrequenciaScheme = new mongoose.Schema({
    nome: String,
    data: Date,
    horario: Date,
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true } // Referência ao usuário
});

const Frequencia = mongoose.model("Frequencia", FrequenciaScheme);
export default Frequencia;