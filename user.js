import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    cpf: { 
        type: String, 
        required: function () { return this.role !== "administrador"; }, // Obrigatório apenas para funcionários
        unique: true 
    },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    foto: { 
        type: [Number], 
        required: function () { return this.role !== "administrador"; } // Obrigatório apenas para funcionários
    },
    frequencia: [{ type: mongoose.Schema.Types.ObjectId, ref: "Frequencia" }],
    role: { type: String, enum: ["funcionario", "administrador"], default: "funcionario" }
});

// Middleware para garantir que apenas um administrador exista
userSchema.pre("save", async function (next) {
    if (this.role === "administrador") {
        const adminExists = await mongoose.models.User.findOne({ role: "administrador" });
        if (adminExists && adminExists._id.toString() !== this._id.toString()) {
            const error = new Error("Já existe um usuário com o papel de administrador.");
            return next(error);
        }
    }
    next();
});

export default mongoose.model("User", userSchema);

