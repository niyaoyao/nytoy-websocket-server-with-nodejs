import { useState, useRef, useEffect } from 'react';
import '../assets/styles/ModelSelector.css'

interface ModelSelectorProps {
  model: string;
  setModel: (model: string) => void;
  modelList: string[];
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ model, setModel, modelList }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="model-selector" ref={containerRef}>
      <button className="model-selector-button" onClick={() => setIsOpen(!isOpen)}>
        ▾ {model} 
      </button>

      <div className={`model-dropdown ${isOpen ? 'open' : ''}`}>
        {modelList.map((m) => (
          <div
            key={m}
            className={`model-option ${m === model ? 'selected' : ''}`}
            onClick={() => {
              setModel(m);
              console.log(`click model: ${m}`);
              setIsOpen(false);
            }}
          >
            {m}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModelSelector;
