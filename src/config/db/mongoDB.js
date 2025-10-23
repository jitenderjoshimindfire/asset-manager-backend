const mongoose = require('mongoose');

const connectMongoDB = async () => {
    try{
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Mongo db connected .....")
    }catch(err){
        console.log(err.message);
        process.exit(1);
    }
}

module.exports = connectMongoDB;