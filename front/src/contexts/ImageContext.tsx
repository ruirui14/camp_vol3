// src/contexts/ImageContext.tsx
import { createContext, useContext, useState } from "react";

// type ImageContextType = {
//   image: string | null; //画像のURLやパスを入れる変数
//   setImage: (img: string | null) => void; //imageを変更するための関数
// };

const ImageContext = createContext<any>({
  image: null,
  // setImage: () => {},
});
//他のコンポーネントをこの Provider で囲むと、image の情報を使えるようになる
export const ImageProvider = ({ children }: { children: React.ReactNode }) => {
  //imageの状態　最初は画像がないからnull
  const [image, setImage] = useState<string | null>(null); //元画像
  const [convertedImage, setConvertedImage] = useState<string | null>(null); // 変換後
  //ImageContext.Provider は、子供のコンポーネントに image と setImage を渡してる
  //囲まれたコンポーネントは useImageContext() を使ってこの情報にアクセスできる
  return (
    <ImageContext.Provider value={{ image, setImage, convertedImage, setConvertedImage }}>
      {children}
    </ImageContext.Provider>
  );
};

//ImageContext を使いやすくするためのショートカット関数（カスタムフック)
//ImageContext を渡すと、その中に入ってる { image, setImage } を返す
export const useImageContext = () => useContext(ImageContext);
