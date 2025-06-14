import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    foto: { 
        type: [Number], 
        required: function () { return this.role !== "administrador"; } 
    },
    perfil: { type: String }, 
    frequencia: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Frequencia",
        required: function () { return this.role === "funcionario"; } 
    }],
    role: { type: String, enum: ["funcionario", "administrador"], default: "funcionario" },
    horarioTrabalho: {
        segunda: {
            entrada: { type: String},
            saida:   { type: String}
        },
        terca: {
            entrada: { type: String},
            saida:   { type: String}
        },
        quarta: {
            entrada: { type: String},
            saida:   { type: String}
        },
        quinta: {
            entrada: { type: String},
            saida:   { type: String}
        },
        sexta: {
            entrada: { type: String},
            saida:   { type: String}
        },
        sabado: {
            entrada: { type: String },
            saida:   { type: String }
        },
        domingo: {
            entrada: { type: String },
            saida:   { type: String }
        }
    }
});

userSchema.pre("save", async function (next) {
    if (this.role === "administrador") {
        const adminExists = await mongoose.models.User.findOne({ role: "administrador" });
        if (adminExists && adminExists._id.toString() !== this._id.toString()) {
            const error = new Error("Já existe um usuário com o papel de administrador.");
            return next(error);
        }

        if (this.frequencia && this.frequencia.length > 0) {
            const error = new Error("Administradores não podem ter frequências associadas.");
            return next(error);
        }
    }
    next();
});

export default mongoose.model("User", userSchema);

