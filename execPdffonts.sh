for file in `\find ./temp -name '*.pdf'`; do
    pdffonts $file > ${file%.*}.txt
    mv $file done/${file##*/} 
done