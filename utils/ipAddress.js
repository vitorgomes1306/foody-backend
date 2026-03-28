// Função para pegar IP do usuário
async function pegarIP() {
    try {
        const resposta = await fetch('https://api.ipify.org');
        const ip = await resposta.text();
        console.log("IP do usuário:", ip);
        return ip;
    } catch (erro) {
        console.error("Erro ao buscar o IP:", erro);
    }
}

export default pegarIP;