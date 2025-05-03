import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    nome: String,
    cpf: Number,
    email: String,
    senha: String,
    frequencia: [{ type: mongoose.Schema.Types.ObjectId, ref: "Frequencia" }] // Relacionamento com as frequências
});

export default mongoose.model("User", UserSchema);