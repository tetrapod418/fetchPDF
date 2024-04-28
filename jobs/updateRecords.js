const { exit } = require('process');
const {KintoneRestAPIClient} = require('@kintone/rest-api-client');
const { log, error } = require('console');
const { getDiffieHellman } = require('crypto');
const { createWriteStream, existsSync } = require('fs');
const { readFile, exists } = require('fs/promises')
const { pipeline } = require('stream/promises');
const { resolve } = require('path');
const { subscribe } = require('diagnostics_channel');
const { rejects, strict } = require('assert');

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
                // 拡張子がpdfだったら、pdffonts実行結果の登録
                const extention = (name.split('.').slice(-1)[0]).toLowerCase();
                console.log(`拡張子: ${extention}`);
                if( extention === 'pdf'){
                    const fullPath = `./temp/${name}`;
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
        const pdffontsResult = await readFile(resultPath, { encoding: "utf8" });
        if(pdffontsResult.length<=0){
            throw new Error(`pdffontsResult is empty!`);
        }
        // pdffonts実行結果のパース
        const rows = await pdffontsResult.split('\n').map(
            (row) => {
                const rowString = new String(row);
                if(!rowString.startsWith("name") && !rowString.startsWith("---") && rowString.length > 0){
                    console.log(`rowStrng: ${rowString}`);
                    return parsLine(rowString);
                }
            }).filter((row) => row != undefined);

        console.log(`rows`, rows);
        // レコードのpdffonts結果テキストを更新
        const params = {
            app,
            id: recordid,
            record: {
                "results_text" : {
                        "value": pdffontsResult
                },
                "pdffonts_result_table" : {
                    "value": rows
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
        return Promise.resolve(true);
    } catch(err) {
        console.log(`An error occurred in updateAppRecord!\n${err.message}`)
        return Promise.reject(err);
    }
}

// pdffontsの結果を配列に変換
function parsLine(line) {
    const HEADER = "name                                 type              encoding         emb sub uni object ID";
    try{
        const name = getName(line, HEADER);
        const fonttype = getFontType(line, HEADER);
        const encoding = getEncoding(line, HEADER);
        const emb = getEmb(line, HEADER);
        const sub = getSub(line, HEADER);
        const uni = getUni(line, HEADER);
        const objectID = getObjectID(line, HEADER);
        console.log(`got ${name}, ${fonttype}, ${encoding}, ${emb}, ${sub}, ${uni}, ${objectID}`);
        const result = { 
            value: {
                name: {
                    type: 'SINGLE_LINE_TEXT',
                    value: name
                },
                type: {
                    type: 'SINGLE_LINE_TEXT',
                    value: fonttype
                },
                encoding: {
                    type: 'SINGLE_LINE_TEXT',
                    value: encoding
                },
                emb: {
                    type: 'SINGLE_LINE_TEXT',
                    value: emb
                },
                sub: {
                    type: 'SINGLE_LINE_TEXT',
                    value: sub
                },
                uni: {
                    type: 'SINGLE_LINE_TEXT',
                    value: uni
                },
                object_id: {
                    type: 'SINGLE_LINE_TEXT',
                    value: objectID
                }
            }
        };
        console.log(`result`, result);
        return result;

    }
    catch(err){
        console.log("parsLine error");
    }
}

// フォント名の取得
function getName(source, headline){
    const nextStr = "type";
    const namebase = source.substring(0, headline.indexOf(nextStr));
    console.log(`namabase[${namebase}] trimEnd[${namebase.trimEnd()}]`);
    return namebase.trimEnd();
}

// フォントタイプの取得
function getFontType(source, headline){
    const startStr = "type";
    const nextStr = "encoding";
    const fonttypebase = source.substring(headline.indexOf(startStr), headline.indexOf(nextStr));
    console.log(`fonttypebase[${fonttypebase}]`);
    return fonttypebase.trimEnd();
}

// encodingの取得
function getEncoding(source, headline){
    const startStr = "encoding";
    const nextStr = "emb";
    const encodingbase = source.substring(headline.indexOf(startStr), headline.indexOf(nextStr));
    console.log(`encodingbase: ${encodingbase}`);
    return encodingbase.trimEnd();
}

// embの取得
function getEmb(source, headline){
    const startStr = "emb";
    const nextStr = "sub";
    const embbase = source.substring(headline.indexOf(startStr), headline.indexOf(nextStr));
    console.log(`embbase: ${embbase}`);
    return embbase.trimEnd();
}

// subの取得
function getSub(source, headline){
    const startStr = "sub";
    const nextStr = "uni";
    const subbase = source.substring(headline.indexOf(startStr), headline.indexOf(nextStr));
    console.log(`subbase: ${subbase}`);
    return subbase.trimEnd();
}

// uniの取得
function getUni(source, headline){
    const startStr = "uni";
    const nextStr = "object";;
    const unibase = source.substring(headline.indexOf(startStr), headline.indexOf(nextStr));
    console.log(`unibase: ${unibase}`);
    return unibase.trimEnd();
}

// objectIDの取得
function getObjectID(source, headline){
    const startStr = "object";
    const objbase = source.substring(headline.indexOf(startStr));
    console.log(`objbase: ${objbase}`);
    return objbase.trimEnd();
}
