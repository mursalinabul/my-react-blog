import fs from 'fs';
import admin from 'firebase-admin';
import express from 'express';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { db, connectToDb } from './db.js';
import path from 'path';

import { fileURLToPath } from 'url';
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);


const credentials = JSON.parse(
    fs.readFileSync('./credentials.json')
);

admin.initializeApp({
    credential: admin.credential.cert(credentials),
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(_dirname,'../build')))

app.get(/^(?!\/api).+/,(req, res)=>{
    res.sendFile(path.join(_dirname, '../build/index.html'));
})

app.use(async(use, req, next) => {
    const {authtoken} = req.headers;

    if (authtoken){
        try{
            req.user = await admin.auth().verifyIdToken(authtoken);
        } catch (e){
            return res.sendStatus(400);
        }
    }
    
    req.user = req.user || {};

    next();
})

app.get('/api/article/:name',async(req,res)=>{
    const { name } = req.params;
    const {uid}= req.user;

    
    const article = await db.collection('articles').findOne({ name });

    if(article) {
        const upvoteIds = article.upvoteIds || [];
        article.canUpvote = uid && !upvoteIds.includes(uid);
        res.json(article);
    } else {
        res.sendStatus(404);
    }
   
})

app.use((req, res, next) =>{
    if(req.user) {
        next();
    } else {
        res.sendStatus(401);
    } 
});

app.put('/api/article/:name/upvote', async (req,res)=>{
    const { name } = req.params;
    const { uid } =req.user;

    const article = await db.collection('articles').findOne({ name });

    if(article) {
        const upvoteIds = article.upvoteIds || [];
        const canUpvote = uid && !upvoteIds.includes(uid);

        if(canUpvote){
            await db.collection('articles').updateOne({ name }, {
                $inc: { upvotes: 1 },
                $push: {upvoteIds:uid}
            });
        }
    
        const updatedArticle = await db.collection('articles').findOne({ name });
        res.json(updatedArticle)
    } else {
            res.send ('That article doesn\'t exist!')
    }
        
});

app.post('/api/article/:name/comments', async (req,res)=>{
    const { name } = req.params;
    const { text } = req.body;
    const { email } = req.user;
    
    await db.collection('articles').updateOne({ name }, {
        $push: { comments: {postedby:email, text }},
    });

    const article =await db.collection('articles').findOne({ name });

    if (article) {
        res.json(article);
    } else {
        res.send ('That article doesn\'t exist!')
    }
    

})

const PORT = process.env.PORT || 8000;

connectToDb(()=>{
    console.log('Successfully connected to database.')
    app.listen(8000, ()=>{
        console.log('server is listening on port ' + PORT); 
    });
})
