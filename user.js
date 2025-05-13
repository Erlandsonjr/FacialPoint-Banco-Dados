import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    cpf: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    foto: { type: [Number], required: true }, 
    frequencia: [{ type: mongoose.Schema.Types.ObjectId, ref: "Frequencia" }]
});

export default mongoose.model("User", userSchema);

