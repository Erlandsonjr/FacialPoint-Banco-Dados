import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    foto: { 
        type: [Number], 
        required: function () { return this.role !== "administrador"; } // Obrigatório apenas para funcionários
    },
    perfil: { type: String }, // Novo campo para armazenar a imagem em Base64
    frequencia: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Frequencia",
        required: function () { return this.role === "funcionario"; } // Apenas para funcionários
    }],
    role: { type: String, enum: ["funcionario", "administrador"], default: "funcionario" },
    horarioTrabalho: {
        entrada: {
            type: String, 
            required: function () { return this.role !== "administrador"; }
        },
        saida: {
            type: String, 
            required: function () { return this.role !== "administrador"; }
        }
    }
});

// Middleware para garantir que apenas um administrador exista
userSchema.pre("save", async function (next) {
    if (this.role === "administrador") {
        const adminExists = await mongoose.models.User.findOne({ role: "administrador" });
        if (adminExists && adminExists._id.toString() !== this._id.toString()) {
            const error = new Error("Já existe um usuário com o papel de administrador.");
            return next(error);
        }

        // Impede que administradores tenham frequências associadas
        if (this.frequencia && this.frequencia.length > 0) {
            const error = new Error("Administradores não podem ter frequências associadas.");
            return next(error);
        }
    }
    next();
});

export default mongoose.model("User", userSchema);

