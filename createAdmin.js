import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "./user.js";

const createAdmin = async () => {
    try {
        // Conectar ao banco de dados
        await mongoose.connect('mongodb://mongo:tuJEDHUWjeACdoOLHlsohZTJKfKqHpWN@nozomi.proxy.rlwy.net:38247');
        console.log("Conectado ao MongoDB");

        // Verificar se já existe um administrador
        const adminExists = await User.findOne({ role: "administrador" });
        if (adminExists) {
            console.log("Já existe um administrador no sistema.");
            return;
        }

        // Dados do administrador
        const nome = "Administrador";
        const email = "admin@faceponto.com"; // Substitua por um e-mail válido
        const senha = "4dminP@ssw0rd7915"; // Substitua por uma senha segura

        // Criptografar a senha
        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Criar o administrador
        const admin = await User.create({
            nome,
            email,
            senha: senhaCriptografada,
            role: "administrador"
        });

        console.log("Administrador criado com sucesso:", admin);
    } catch (error) {
        console.error("Erro ao criar administrador:", error);
    } finally {
        // Fechar a conexão com o banco de dados
        mongoose.connection.close();
    }
};

createAdmin();