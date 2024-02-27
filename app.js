const axios = require('axios');
const express = require('express');
const app = express();
const port = 3000;

const cors = require('cors');
app.use(cors({
    origin: '*'
}));


app.get('/cpf/:cpf', async (req, res) => {
    try {
        const cpf = req.params.cpf;
        const response = await axios.get(`https://databit.online/api?token=3eaf82ca-0a30-4f14-8313-937c8b26a0f1&type=cpftype&query=${cpf} 
    `);
        res.json(response.data);
    } catch (error) {
        res.status(500).send('Error retrieving CPF information');
    }
});

app.get('/ip', async (req, res) => {
    try {
        const response = await axios.get(`https://api.ip2location.io/?key=186019B77AAC61D08BDF0BD42F75AB05 
      `);
        res.json(response.data);
    } catch (error) {
        res.status(500).send('Error retrieving IP information');
    }
});


app.get('/cep/:cep', async (req, res) => {
    try {
        const cep = req.params.cep;
        const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
        res.json(response.data);
    } catch (error) {
        res.status(500).send('Error retrieving CEP information');
    }
});



app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
