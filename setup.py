from setuptools import setup, find_packages

setup(
    name="facelaps",
    version="0.15",
    packages=find_packages(),
    install_requires=[
        'opencv-python>=4.8.0',
        'numpy>=1.24.0',
        'mediapipe>=0.10.0',
    ],
    author="Clure",
    description="Un outil pour créer des timelapse de visages",
    long_description=open('README.md').read(),
    long_description_content_type="text/markdown",
    url="https://github.com/cluron/facelaps2",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires='>=3.8',
) 