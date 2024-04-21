const { exit } = require('process');
const {KintoneRestAPIClient} = require('@kintone/rest-api-client');
const { log, error } = require('console');
const { getDiffieHellman } = require('crypto');
const { createWriteStream, existsSync } = require('fs');
const { readFile, exists } = require('fs/promises')
const { pipeline } = require('stream/promises');
const { resolve } = require('path');
const { subscribe } = require('diagnostics_channel');
const { rejects } = require('assert');


(async ()=>{

    try {
        // クライアントの作成
        const client = new KintoneRestAPIClient({
          // kintoneのデータ取得先を設定
          baseUrl: 'https://1lc011kswasj.cybozu.com',
          auth: {
            apiToken: process.env.KINTONE_FETCH_API_TOKEN
          }
        });
    
        console.log(`${!process.env.KINTONE_FETCH_API_TOKEN?"NO TOKEN" : "SET TOKEN"}`);

        // リクエストパラメータの設定
        const APP_ID = 4;
        const query_string = 'ステータス="自動チェック中"';
        const params = {
          app: APP_ID,
          fields:['$id', 'ステータス', 'title', 'pdf'],
          query: query_string
        };
        
        // レコードの取得
        const record = await client.record.getRecords(params);
        if(!record || record.records.length === 0){
          console.log('nodata');
          return;
        }
  
        console.log(`getRecords ${record.records.length} records`);
        record.records.map(
            (record) => {
                // ファイル情報の取得
                const { fileKey, name, contentType } = record['pdf'].value[0];
                // 拡張子がpdfだったら、pdffonts実行
                const extention = (name.split('.').slice(-1)[0]).toLowerCase();
                console.log(`拡張子: ${extention}`);
                if( extention === 'pdf'){
                    const fullPath = `temp/${name}`;
                    const resultPath = fullPath.replace(".pdf", ".txt");
                    // pdffontsの実行結果反映とステータス更新
                    return updateAppRecord(client, APP_ID, record.$id.value, resultPath);
                }
            }
        )
    } catch (err) {
        console.error(`実行失敗 :${err.message}`);
    }
})();


// 対象レコードへのpdffontsの結果反映とステータス更新
async function updateAppRecord(client, app, recordid, resultPath) {
    try {
        console.log(`ID${recordid} : 結果ファイルの読み込み ${resultPath}`);
        // 結果の読み込み
        const pdffontsResult = await readFile(encodeURI(resultPath), { encoding: "utf8" });
        if(pdffontsResult.length<=0){
            throw new Error(`pdffontsResult is empty!`);
        }
        // pdffonts実行結果のパース
        const resultCols = {
            fontname, fonttype, encoding, emb, sub, uni, fontobject, fontID
        }
        const rows = pdffontsResult.split('\n').filter((row) => row.split(' ').length > 3).map(
            (row) => {
                return new resultCols(parsLine(row));
            }
        );

        // レコードのpdffonts結果テキストを更新
        const params = {
            app,
            id: recordid,
            record: {
                "results_text" : {
                        "value": pdffontsResult
                }
            }
        }
        client.record.updateRecord(params, (err) => {
            if (err) {
                console.error(err.message);
                return Promise.reject(err);
            }
            console.log('record update success');
        });
        // ステータス更新
        const statusParams = {
            action : "自動チェック済",
            app,
            id: recordid,
        }
        client.record.updateRecordStatus(statusParams, (err) => {
            if (err) {
                console.error(err.message);
                return Promise.reject(err);
            }
        });
        return Promise.resolve();
    } catch(err) {
        console.log(`An error occurred in updateAppRecord!\n${err.message}`)
        return Promise.reject(err);
    }
}

// pdffontsの結果を配列に変換
async function parsLine(line) {
    const {
        fontname, fonttype, encoding, emb, sub, uni, fontobject, fontID
    } = line.split(' ').map((col) => col.replace(" ", ""));
    console.log(`line ${fontname}, ${type}, ${encoding}, ${emb}, ${sub}, ${uni}, ${fontobject}, ${fontID}`);
    
    return new resultCols(fontname, fonttype, encoding, emb, sub, uni, fontobject, fontID);
}