import mongoose from "mongoose";

const FrequenciaScheme = new mongoose.Schema({
    nome: String,
    data: Date,
    horario: Date,

});

const Frequencia =mongoose.model("Frequencia",FrequenciaScheme);
export default Frequencia